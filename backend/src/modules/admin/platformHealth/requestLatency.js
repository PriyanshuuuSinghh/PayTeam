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
  // Keep only timing data. The ring bounds memory even during a traffic spike.
  const samples = [];
  let nextIndex = 0;

  function record(durationMs, at = Date.now(), failed = false) {
    samples[nextIndex] = { durationMs, at, failed };
    nextIndex = (nextIndex + 1) % maxSamples;
  }

  function snapshot(now = Date.now()) {
    const cutoff = now - windowMinutes * minuteMs;
    const minuteBoundary = Math.floor(now / minuteMs) * minuteMs;
    const durations = [];
    const buckets = new Map();
    let errorCount = 0;
    for (const { durationMs, at, failed } of samples) {
      if (at < cutoff || at > now) continue;
      durations.push(durationMs);
      if (failed) errorCount += 1;
      const minute = Math.floor(at / minuteMs) * minuteMs;
      if (minute < cutoff || minute >= minuteBoundary) continue;
      if (!buckets.has(minute)) buckets.set(minute, []);
      buckets.get(minute).push(durationMs);
    }

    // Skip the oldest minute if the ring may have discarded some of its samples.
    const oldest = samples.length === maxSamples ? samples[nextIndex].at : -Infinity;
    const history = [];
    for (let at = minuteBoundary - (windowMinutes - 1) * minuteMs; at < minuteBoundary; at += minuteMs) {
      history.push(at > oldest ? p95(buckets.get(at) ?? []) : null);
    }

    return { p95Ms: p95(durations), sampleCount: durations.length, errorCount, windowMinutes, history };
  }

  return { record, snapshot };
}

export const requestLatency = createRequestLatencyTracker();
const idtoRequests = createRequestLatencyTracker();

export function recordIdtoRequest(failed) {
  idtoRequests.record(0, Date.now(), failed);
}

export function getIdtoErrors() {
  const { errorCount, sampleCount, windowMinutes } = idtoRequests.snapshot();
  return { errorCount, sampleCount, windowMinutes };
}

export function measureApiLatency(req, res, next) {
  // Exclude probes and telemetry polling so opening the dashboard cannot create samples.
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (req.method !== "OPTIONS" && path.startsWith("/api/") &&
      path !== "/api/health" && path !== platformHealthPath) {
    const started = performance.now();
    res.once("finish", () => requestLatency.record(performance.now() - started, Date.now(), res.statusCode >= 500));
  }
  next();
}
