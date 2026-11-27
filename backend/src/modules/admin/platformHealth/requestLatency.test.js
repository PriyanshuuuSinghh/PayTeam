import assert from "node:assert/strict";
import test from "node:test";
import { createRequestLatencyTracker } from "./requestLatency.js";

const minute = 60_000;

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
