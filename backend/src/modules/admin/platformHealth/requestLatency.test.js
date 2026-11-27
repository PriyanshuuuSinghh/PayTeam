import assert from "node:assert/strict";
import test from "node:test";
import { createRequestLatencyTracker, getIdtoErrors } from "./requestLatency.js";
import { createIdtoHttpClient } from "../../kyc/document-verification/shared/idtoHttpClient.js";

const minute = 60_000;

test("error count uses the same rolling sample window as latency", () => {
  const tracker = createRequestLatencyTracker();
  tracker.record(10, 0, true);
  tracker.record(50, 10 * minute, true);
  tracker.record(20, 15 * minute, false);
  const snapshot = tracker.snapshot(20 * minute);
  assert.equal(snapshot.sampleCount, 2);
  assert.equal(snapshot.errorCount, 1);
});

test("IDTO transport records successful, HTTP-failed and network-failed requests", async () => {
  const outcomes = [
    () => new Response("{}", { headers: { "Content-Type": "application/json" } }),
    () => new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } }),
    () => { throw new Error("connection unavailable"); },
  ];
  const client = createIdtoHttpClient({
    env: { IDTO_BASE_URL: "https://test.invalid", IDTO_CLIENT_ID: "test", IDTO_API_KEY: "test" },
    fetchImpl: async () => outcomes.shift()(),
  });
  const before = getIdtoErrors();
  await client.postJson("/v2/verify/pan_detailed", {});
  await assert.rejects(client.postJson("/v2/verify/pan_detailed", {}), { code: "IDTO_HTTP_ERROR" });
  await assert.rejects(client.postJson("/v2/verify/pan_detailed", {}), { code: "IDTO_NETWORK_ERROR" });
  const after = getIdtoErrors();
  assert.equal(after.sampleCount - before.sampleCount, 3);
  assert.equal(after.errorCount - before.errorCount, 2);
});

test("p95 uses the nearest rank in the rolling window and keeps empty minute gaps", () => {
  const tracker = createRequestLatencyTracker();
  const now = 30 * minute;
  tracker.record(5_000, now - 15 * minute - 1);
  tracker.record(5_000, now + 1);
  for (let i = 1; i <= 19; i++) tracker.record(i, now - minute);
  tracker.record(1_000, now - 3 * minute);

  const result = tracker.snapshot(now);
  assert.equal(result.p95Ms, 19);
  assert.equal(result.sampleCount, 20);
  assert.deepEqual(result.history.slice(-3), [1_000, null, 19]);
});

test("no samples differ from a measured zero and the ring evicts its oldest sample", () => {
  const tracker = createRequestLatencyTracker();
  assert.equal(tracker.snapshot(0).p95Ms, null);
  tracker.record(0, 0);
  assert.equal(tracker.snapshot(0).p95Ms, 0);
  for (let i = 1; i <= 10_000; i++) tracker.record(1, i);
  const result = tracker.snapshot(10_000);
  assert.equal(result.sampleCount, 10_000);
  assert.equal(result.p95Ms, 1);
});
