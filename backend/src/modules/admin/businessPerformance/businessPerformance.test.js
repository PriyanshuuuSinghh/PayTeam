import assert from "node:assert/strict";
import test from "node:test";
import pool from "../../../config/db.js";
import { getBusinessPerformance, getBusinessWindow } from "./businessPerformance.js";

const now = Date.parse("2026-11-27T08:30:00Z") / 1000;
const epoch = (value) => Date.parse(value) / 1000;

test("presets compare adjacent windows of equal length", () => {
  for (const [period, hours] of [["1h", 1], ["24h", 24], ["7d", 168], ["30d", 720]]) {
    const length = hours * 3600;
    assert.deepEqual(getBusinessWindow({ period }, now), {
      start: now - length, end: now, previousStart: now - length * 2,
    });
  }
});

test("custom dates are inclusive IST calendar days and today is capped at the current time", () => {
  assert.deepEqual(getBusinessWindow({ period: "custom", startDate: "2026-11-25", endDate: "2026-11-26" }, now), {
    start: epoch("2026-11-24T18:30:00Z"),
    end: epoch("2026-11-26T18:30:00Z"),
    previousStart: epoch("2026-11-22T18:30:00Z"),
  });
  assert.deepEqual(getBusinessWindow({ period: "custom", startDate: "2026-11-27", endDate: "2026-11-27" }, now), {
    start: epoch("2026-11-26T18:30:00Z"), end: now, previousStart: epoch("2026-11-26T04:30:00Z"),
  });
});

test("invalid dates, inverted or future ranges, and unknown filters are rejected", () => {
  for (const query of [
    { period: "7h" },
    { period: "1h", startDate: "2026-11-25" },
    { period: "custom", startDate: "2026-02-30", endDate: "2026-11-27" },
    { period: "custom", startDate: "2026-11-27", endDate: "2026-11-26" },
    { period: "custom", startDate: "2026-11-27", endDate: "2026-11-28" },
  ]) {
    assert.throws(() => getBusinessWindow(query, now), { statusCode: 400 });
  }
});

test("aggregates customer counts and preserves decimal balances, genuine zero, and missing wallet coverage", async (t) => {
  let signups = { current_count: 0, previous_count: 4 };
  let wallet = { amount: "9007199254740993.01", missing_wallets: 0 };
  t.mock.method(pool, "execute", async (sql, params) => {
    assert.match(sql, /r\.slug = 'US'/);
    if (sql.includes("AS current_count")) {
      assert.match(sql, /UNIX_TIMESTAMP\(u\.created_at\) >= \? AND UNIX_TIMESTAMP\(u\.created_at\) < \?/);
      assert.equal(params[0], params[1]);
      assert.equal(params[0] - params[2], params[3] - params[0]);
      return [[signups]];
    }
    assert.match(sql, /SUM\(w\.mainbalance \+ w\.pgbalance \+ w\.qrbalance \+ w\.settlementwallet\)/);
    assert.doesNotMatch(sql, /lockamount|wallet_ledger_entries/);
    return [[wallet]];
  });

  const first = await getBusinessPerformance({ period: "24h" });
  assert.deepEqual(first.signups, { current: 0, previous: 4, changePercent: -100 });
  assert.deepEqual(first.walletBalance, { amount: "9007199254740993.01", currency: "INR" });

  signups = { current_count: 0, previous_count: 0 };
  wallet = { amount: "0.00", missing_wallets: 0 };
  const empty = await getBusinessPerformance({ period: "24h" });
  assert.deepEqual(empty.signups, { current: 0, previous: 0, changePercent: null });
  assert.equal(empty.walletBalance.amount, "0.00");

  wallet.missing_wallets = 1;
  assert.equal((await getBusinessPerformance({ period: "24h" })).walletBalance.amount, null);
});
