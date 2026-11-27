import assert from "node:assert/strict";
import test from "node:test";
import { createMetricPoller } from "./metricPolling.js";

test("polling pauses in hidden tabs, coalesces forced refreshes and never overlaps", async () => {
  let hidden = true;
  const requests = [];
  const results = [];
  const poller = createMetricPoller({
    intervalMs: 15_000,
    isHidden: () => hidden,
    load: (signal) => new Promise((resolve) => requests.push({ resolve, signal })),
    onSuccess: (data) => results.push(data),
    onError: assert.fail,
    onStale: () => {},
  });
  await poller.refresh();
  assert.equal(requests.length, 0);

  hidden = false;
  const initial = poller.refresh();
  await poller.refresh();
  await poller.refresh(true);
  await poller.refresh(true);
  assert.equal(requests.length, 1);
  requests[0].resolve(0);
  await initial;
  assert.deepEqual(results, [0]);
  assert.equal(requests.length, 2);

  poller.dispose();
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(1);
  await poller.refresh();
  assert.deepEqual(results, [0]);
});

test("freshness is based on the last successful timestamp and a failed refresh stays distinct", async () => {
  let now = 1;
  let fail = false;
  const events = [];
  const poller = createMetricPoller({
    intervalMs: 30_000, isHidden: () => false, now: () => now,
    load: async () => { if (fail) throw new Error("failed"); return 0; },
    onSuccess: (data, at) => events.push([data, +at]),
    onError: () => events.push("error"),
    onStale: () => events.push("stale"),
  });
  await poller.refresh();
  now += 60_000;
  fail = true;
  await poller.refresh();
  assert.deepEqual(events, [[0, 1], "stale", "error"]);
});
