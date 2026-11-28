import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { test } from "node:test";
import mysql from "mysql2/promise";
import { SERVICE_CATALOGUE, getServiceDefinition } from "../schemes/serviceCatalogue.js";

const options = { limit: 50, offset: 0 };

test("catalogue on isolated MySQL after baseline, catalogue migration, and rerun", {
  skip: !process.env.CATALOGUE_TEST_DATADIR,
}, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_PORT, "3307");
  assert.equal(process.env.DB_NAME, "payteam_kyc");
  assert.equal(process.env.DB_USER, "scheme_v2_migrator");
  assert.ok(!process.env.DB_SSL_CA);

  const connection = await mysql.createConnection({
    host: "127.0.0.1", port: 3307, database: "payteam_kyc",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  t.after(() => connection.end());
  const [[server]] = await connection.query(`
    SELECT @@datadir AS datadir, @@server_uuid AS serverUuid, @@port AS port,
           @@bind_address AS bindAddress, DATABASE() AS db
  `);
  assert.equal(await realpath(server.datadir), await realpath(process.env.CATALOGUE_TEST_DATADIR));
  assert.equal(server.serverUuid, process.env.CATALOGUE_TEST_SERVER_UUID);
  assert.equal(server.port, 3307);
  assert.equal(server.bindAddress, "127.0.0.1");
  assert.equal(server.db, "payteam_kyc");

  const { default: pool } = await import("../../config/db.js");
  t.after(() => pool.end());
  const { default: model } = await import("./catalogue.model.js");
  const { getServiceOperators } = await import("./catalogue.service.js");
  const services = await model.listServices(options);
  const diamond = services.items.find(({ code }) => code === "Diamond 4");
  const bbps = services.items.find(({ code }) => code === "BBPS");

  await t.test("retrieves seed data with exact repository identifiers, filters, and stable pagination", async () => {
    assert.deepEqual(services.items.map(({ code }) => code), SERVICE_CATALOGUE.map(({ id }) => id));
    assert.equal(services.pagination.total, 28);
    assert.deepEqual(await model.findService(diamond.id), diamond);
    assert.equal(await model.findService("18446744073709551615"), null);
    assert.deepEqual((await model.listServices({ ...options, status: 1 })).items, [diamond]);
    assert.equal((await model.listServices({ ...options, status: 0 })).pagination.total, 27);
    const page = await model.listServices({ limit: 3, offset: 2 });
    assert.deepEqual(page.items, services.items.slice(2, 5));
    assert.deepEqual(page.pagination, { limit: 3, offset: 2, total: 28 });
    const codes = getServiceDefinition("Diamond 4").operators;
    const operators = (await model.listOperators({ ...options, status: 1 })).items;
    assert.deepEqual(operators.map(({ code }) => code), [...codes].sort());
    assert.deepEqual((await model.listOperators({ ...options, status: 0 })).items, []);
    const mappings = (await getServiceOperators(diamond.id, { status: "1" })).items;
    assert.deepEqual(mappings.map(({ code }) => code), codes);
    assert.ok(mappings.every(({ selectable }) => selectable));
    assert.deepEqual((await getServiceOperators(diamond.id, { status: "0" })).items, []);
    assert.deepEqual(await getServiceOperators(bbps.id, {}), { items: [], pagination: { ...options, total: 0 } });
  });

  await t.test("enforces uniqueness, foreign keys and binary statuses", async () => {
    const [[mapping]] = await connection.execute(
      "SELECT CAST(operator_id AS CHAR) AS operatorId FROM service_operators WHERE service_id = ? LIMIT 1", [diamond.id],
    );
    await connection.beginTransaction();
    try {
      await assert.rejects(connection.execute("INSERT INTO services (code, name) VALUES (?, ?)", [diamond.code, "Duplicate"]), { code: "ER_DUP_ENTRY" });
      await assert.rejects(connection.execute("INSERT INTO operators (code, name, operator_type) VALUES ('UPI', 'Duplicate', 'TRANSFER_CHANNEL')"), { code: "ER_DUP_ENTRY" });
      const insertMapping = "INSERT INTO service_operators (service_id, operator_id, status) VALUES (CAST(CAST(? AS CHAR) AS UNSIGNED), CAST(CAST(? AS CHAR) AS UNSIGNED), ?)";
      await assert.rejects(connection.execute(insertMapping, [diamond.id, mapping.operatorId, 1]), { code: "ER_DUP_ENTRY" });
      const missingId = "18446744073709551615";
      const isMissingReference = ({ code }) => ["ER_NO_REFERENCED_ROW", "ER_NO_REFERENCED_ROW_2"].includes(code);
      await assert.rejects(connection.execute(insertMapping, [missingId, mapping.operatorId, 1]), isMissingReference);
      await assert.rejects(connection.execute(insertMapping, [diamond.id, missingId, 1]), isMissingReference);
      for (const [sql, args] of [
        ["INSERT INTO services (code, name, status) VALUES ('TEST', 'Test', 2)", []],
        ["INSERT INTO operators (code, name, operator_type, status) VALUES ('TEST', 'Test', 'PAYMENT_METHOD', 2)", []],
        [insertMapping, [bbps.id, mapping.operatorId, 2]],
      ]) {
        await assert.rejects(connection.execute(sql, args), { code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      }
    } finally {
      await connection.rollback();
    }
  });

  await t.test("supports an inactive BBPS test hierarchy with stable ordering on tied display order", async (fixtureTest) => {
    await connection.beginTransaction();
    try {
      await connection.query(`
        INSERT INTO operators (code, name, operator_type) VALUES
          ('CREDIT_CARD', 'Credit Card', 'PAYMENT_METHOD'),
          ('DEBIT_CARD', 'Debit Card', 'PAYMENT_METHOD')
      `);
      for (const code of ["UPI", "DEBIT_CARD", "CREDIT_CARD"]) {
        await connection.execute(`
          INSERT INTO service_operators (service_id, operator_id)
          SELECT CAST(? AS UNSIGNED), id FROM operators WHERE code = ?
        `, [bbps.id, code]);
      }
      fixtureTest.mock.method(pool, "execute", connection.execute.bind(connection));
      const { items } = await getServiceOperators(bbps.id, { status: "0" });
      assert.deepEqual(items.map(({ code }) => code), ["UPI", "DEBIT_CARD", "CREDIT_CARD"]);
      assert.ok(items.every(({ selectable, status }) => !selectable && status === 0));
    } finally {
      await connection.rollback();
    }
  });

  await t.test("migration history preserves both SQL checksums and single seed application", async () => {
    const [history] = await connection.query("SELECT migration, sha256 FROM schema_migrations ORDER BY migration LIMIT 2");
    const migrations = ["001_initial_schema.sql", "002_master_service_operator_catalogue.sql"];
    assert.deepEqual(history.map(({ migration }) => migration), migrations);
    for (const { migration, sha256 } of history) {
      const file = new URL(`../../../database/migrations/${migration}`, import.meta.url);
      const sql = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
      assert.equal(sha256, createHash("sha256").update(sql).digest("hex"));
    }
    const [[{ total }]] = await connection.query("SELECT COUNT(*) AS total FROM service_operators");
    assert.equal(Number(total), 4);
  });
});
