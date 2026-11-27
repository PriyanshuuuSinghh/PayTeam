import assert from "node:assert/strict";
import test from "node:test";
import pool from "../../../config/db.js";
import { STEP_NAMES } from "../../kyc/submission/submission.service.js";
import { getBusinessInsights } from "./businessInsights.js";

test("funnel counts consecutive completed steps per customer case within the selected IST cohort", async (t) => {
  t.mock.method(pool, "execute", async (sql, params) => {
    assert.match(sql, /r\.slug = 'US'/);
    if (sql.includes("AS active_customers")) {
      assert.match(sql, /COUNT\(\*\) AS total_customers/);
      assert.match(sql, /COUNT\(CASE WHEN u\.status = 'active' THEN 1 END\)/);
      assert.equal(params, undefined);
      return [[{ active_customers: "21", total_customers: "30" }]];
    }
    assert.match(sql, /LEFT JOIN kyc_steps ks ON ks\.case_id = kc\.id AND ks\.status = 'completed'/);
    assert.match(sql, /GROUP BY kc\.id, kc\.status/);
    assert.match(sql, /case_progress\.status = 'approved'/);
    assert.match(sql, /UNIX_TIMESTAMP\(kc\.created_at\) >= \?\s+AND UNIX_TIMESTAMP\(kc\.created_at\) < \?/);
    assert.deepEqual(params, [
      Date.parse("2024-11-23T18:30:00Z") / 1000,
      Date.parse("2024-11-24T18:30:00Z") / 1000,
    ]);
    return [[
      { completed_mask: "0", case_count: "1", approved_count: "0" },
      { completed_mask: "5", case_count: "2", approved_count: "0" }, // Steps 1 and 3, but not 2
      { completed_mask: "3", case_count: "3", approved_count: "0" },
      { completed_mask: "127", case_count: "4", approved_count: "2" },
    ]];
  });

  const data = await getBusinessInsights({ period: "custom", startDate: "2024-11-24", endDate: "2024-11-24" });
  assert.equal(data.activeCustomers, 21);
  assert.equal(data.totalCustomers, 30);
  assert.equal(data.kycFunnel.totalCases, 10);
  assert.equal(data.kycFunnel.approvedCases, 2);
  assert.deepEqual(data.kycFunnel.steps.map((step) => step.label), Object.values(STEP_NAMES));
  assert.deepEqual(data.kycFunnel.steps.map((step) => step.completed), [9, 7, 4, 4, 4, 4, 4]);
});

test("empty cohort and zero active customers are genuine zeros", async (t) => {
  const execute = t.mock.method(pool, "execute", async (sql) =>
    sql.includes("AS active_customers") ? [[{ active_customers: 0, total_customers: 0 }]] : [[]]);

  await assert.rejects(getBusinessInsights({ period: "invalid" }), { statusCode: 400 });
  assert.equal(execute.mock.callCount(), 0);
  const data = await getBusinessInsights({ period: "1h" });
  assert.equal(data.activeCustomers, 0);
  assert.equal(data.totalCustomers, 0);
  assert.equal(data.kycFunnel.totalCases, 0);
  assert.equal(data.kycFunnel.approvedCases, 0);
  assert.deepEqual(data.kycFunnel.steps.map((step) => step.completed), Array(7).fill(0));
});
