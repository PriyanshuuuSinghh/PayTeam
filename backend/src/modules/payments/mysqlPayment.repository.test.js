import assert from "node:assert/strict";
import { test } from "node:test";
import { createMysqlPaymentRepository } from "./mysqlPayment.repository.js";

function createFakePool() {
  const rows = new Map();
  const calls = [];
  let id = 0;
  const execute = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.startsWith("INSERT INTO payment_transactions")) {
      const columns = sql.match(/INSERT INTO payment_transactions\s*\(([\s\S]*?)\)\s*VALUES/)[1].split(",").map((value) => value.trim());
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      const key = `${row.user_id}:${row.operation}:${row.idempotency_key}`;
      if ([...rows.values()].some((entry) => entry.key === key)) throw Object.assign(new Error("duplicate key"), { code: "ER_DUP_ENTRY" });
      row.id = ++id;
      row.amount_paise = String(row.amount_paise);
      rows.set(row.id, { key, row });
      return [{ insertId: row.id }, []];
    }
    if (sql.includes("FROM payment_transactions WHERE id = ?")) {
      const row = rows.get(Number(values[0]))?.row;
      return [row ? [{ ...row }] : [], []];
    }
    if (sql.includes("FROM payment_transactions WHERE user_id = ? AND operation = ? AND idempotency_key = ?")) {
      const entry = [...rows.values()].find(({ row }) => String(row.user_id) === String(values[0]) && row.operation === values[1] && row.idempotency_key === values[2]);
      return [entry ? [{ ...entry.row }] : [], []];
    }
    return [[], []];
  };
  const pool = {
    calls,
    execute,
    async getConnection() {
      return {
        execute,
        async beginTransaction() { calls.push({ transaction: "begin" }); },
        async commit() { calls.push({ transaction: "commit" }); },
        async rollback() { calls.push({ transaction: "rollback" }); },
        release() { calls.push({ transaction: "release" }); },
      };
    },
  };
  return pool;
}

function initiation(overrides = {}) {
  return {
    user_id: 52, initiator_user_id: 52, operation: "ADD_MONEY_DIAMOND_4", gateway: "PREMIUM_PG_3",
    request_id: "request-0001", idempotency_key: "key-00000001", idempotency_payload_hash: "a".repeat(64),
    amount_paise: "1000", currency: "INR", status: "PENDING", initiation_status_code: "PENDING",
    settlement_status: "UNCONFIRMED", intended_settlement_mode: "T_PLUS_1", charges: { serviceChargePaise: "0", instantChargePaise: "0" },
    configuration_snapshot: { schemeId: 1 }, created_at: new Date(), ...overrides,
  };
}

test("MySQL payment repository persists an idempotency row atomically and replays the stored transaction", async () => {
  const pool = createFakePool();
  const repository = createMysqlPaymentRepository(pool);
  const first = await repository.persistInitiation(initiation());
  const second = await repository.persistInitiation(initiation({ request_id: "request-0002", amount_paise: "9900" }));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal(second.transaction.request_id, "request-0001");
  assert.equal(second.transaction.amount_paise, "1000");
  assert.match(pool.calls.find((call) => call.sql?.startsWith("INSERT INTO payment_transactions")).sql, /idempotency_payload_hash/);
  assert.equal(pool.calls.filter((call) => call.transaction === "begin").length, 2);
  assert.equal(pool.calls.filter((call) => call.transaction === "commit").length, 2);
});

test("payment persistence stores account identity and amounts without customer contact PII", async () => {
  const pool = createFakePool();
  const repository = createMysqlPaymentRepository(pool);
  await repository.persistInitiation(initiation({ customer_name: "Payer", customer_phone: "+919876543210", customer_email: "payer@example.com" }));
  const insert = pool.calls.find((call) => call.sql?.startsWith("INSERT INTO payment_transactions"));
  assert.doesNotMatch(insert.sql, /customer_name|customer_phone|customer_email/);
  assert.equal(insert.values.includes("Payer"), false);
  assert.equal(insert.values.includes("+919876543210"), false);
  assert.equal(insert.values.includes("payer@example.com"), false);
});

test("MySQL payment repository passes user and operation scope to durable idempotency lookup", async () => {
  const pool = createFakePool();
  const repository = createMysqlPaymentRepository(pool);
  await repository.findIdempotentInitiation({ userId: 52, operation: "ADD_MONEY_DIAMOND_4", idempotencyKey: "key-00000001" });
  const call = pool.calls[0];
  assert.match(call.sql, /user_id = \? AND operation = \? AND idempotency_key = \?/);
  assert.deepEqual(call.values, [52, "ADD_MONEY_DIAMOND_4", "key-00000001"]);
});

test("effective scheme lookup returns the assigned scheme or the active default", async () => {
  const calls = [];
  const repository = createMysqlPaymentRepository({
    async execute(sql, values) {
      calls.push({ sql, values });
      return [[{ id: 7, name: "Default", isDefault: 1 }], []];
    },
    async getConnection() { throw new Error("not used"); },
  });
  assert.deepEqual(await repository.findAssignedScheme(52), { id: 7, name: "Default", isDefault: 1 });
  assert.match(calls[0].sql, /COALESCE\(sa\.scheme_id/);
  assert.deepEqual(calls[0].values, [52]);
});

test("ancestor resolution fails closed instead of truncating a hierarchy beyond its query bound", async () => {
  let query;
  const repository = createMysqlPaymentRepository({
    async execute(sql) {
      query = sql;
      return [[{ id: 1, parent_id: 2, role_id: 1, hierarchy_level: 128, edge_valid: 1, cycle_found: 0 }], []];
    },
    async getConnection() { throw new Error("not used"); },
  });
  await assert.rejects(repository.listEligibleAncestors({ userId: 52, hierarchyLevels: [128] }), {
    code: "HIERARCHY_CONFIGURATION_INVALID",
  });
  assert.match(query, /role_hierarchy/);
});

test("MySQL payment repository fails closed when the database is unreachable", async () => {
  const repository = createMysqlPaymentRepository({
    async execute() { throw Object.assign(new Error("private transport detail"), { code: "EACCES" }); },
    async getConnection() { throw Object.assign(new Error("private transport detail"), { code: "EACCES" }); },
  });
  await assert.rejects(repository.findIdempotentInitiation({ userId: 52, operation: "ADD_MONEY_DIAMOND_4", idempotencyKey: "key-00000001" }), {
    statusCode: 503,
    code: "PAYMENT_CAPABILITY_UNAVAILABLE",
  });
});

test("wallet posting rolls back unless the stored payment and settlement are both confirmed", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async execute(sql) {
      calls.push(sql);
      if (sql.includes("FROM payment_transactions")) return [[{ id: 10, operation: "ADD_MONEY_DIAMOND_4", status: "SUCCESS", settlement_status: "SETTLEMENT_PENDING" }], []];
      return [[], []];
    },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const repository = createMysqlPaymentRepository({ async execute() { return [[], []]; }, async getConnection() { return connection; } });
  await assert.rejects(repository.postWalletLedgerCommissionsAtomically({ requestId: "request-0001", walletCreditPaise: "1000" }), { code: "PAYMENT_NOT_SETTLED" });
  assert.equal(calls.includes("rollback"), true);
  assert.equal(calls.some((sql) => typeof sql === "string" && sql.includes("INSERT INTO wallet_ledger_entries")), false);
  assert.equal(calls.includes("commit"), false);
});
