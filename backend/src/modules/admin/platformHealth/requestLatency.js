import { performance } from "node:perf_hooks";

const minuteMs = 60_000;
const windowMinutes = 15;
const maxSamples = 10_000;
export const platformHealthPath = "/api/admin/platform-health";

function p95(values) {
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.ceil(values.length * 0.95) - 1];
}

export function createRequestLatencyTracker() {
  // Keep aggregate inputs only. The ring bounds memory even during a traffic spike.
  const samples = [];
  let nextIndex = 0;

  function record(durationMs, at = Date.now(), failed = false) {
    samples[nextIndex] = { durationMs, at, failed };
    nextIndex = (nextIndex + 1) % maxSamples;
  }

  function snapshot(now = Date.now(), includeLatency = true) {
    const cutoff = now - windowMinutes * minuteMs;
    const minuteBoundary = Math.floor(now / minuteMs) * minuteMs;
    const durations = [];
    const buckets = new Map();
    let errorCount = 0;
    let sampleCount = 0;
    for (const { durationMs, at, failed } of samples) {
      if (at < cutoff || at > now) continue;
      sampleCount += 1;
      if (failed) errorCount += 1;
      if (!includeLatency) continue;
      durations.push(durationMs);
      const minute = Math.floor(at / minuteMs) * minuteMs;
      if (minute < cutoff || minute >= minuteBoundary) continue;
      if (!buckets.has(minute)) buckets.set(minute, []);
      buckets.get(minute).push(durationMs);
    }
    if (!includeLatency) return { errorCount, sampleCount, windowMinutes };

    // Skip the oldest minute if the ring may have discarded some of its samples.
    const oldest = samples.length === maxSamples ? samples[nextIndex].at : -Infinity;
    const history = [];
    for (let at = minuteBoundary - (windowMinutes - 1) * minuteMs; at < minuteBoundary; at += minuteMs) {
      history.push(at > oldest ? p95(buckets.get(at) ?? []) : null);
    }

    return { p95Ms: p95(durations), sampleCount, errorCount, windowMinutes, history };
  }

  return { record, snapshot };
}

export const requestLatency = createRequestLatencyTracker();
const idtoRequests = createRequestLatencyTracker();

export function recordIdtoRequest(failed) {
  idtoRequests.record(0, Date.now(), failed);
}

export function getIdtoErrors() {
  return idtoRequests.snapshot(Date.now(), false);
}

export function measureApiLatency(req, res, next) {
  // Exclude probes and the telemetry endpoint from the measured request population.
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (req.method !== "OPTIONS" && path.startsWith("/api/") &&
      path !== "/api/health" && path !== platformHealthPath) {
    const started = performance.now();
    res.once("finish", () => requestLatency.record(performance.now() - started, Date.now(), res.statusCode >= 500));
  }
  next();
}
