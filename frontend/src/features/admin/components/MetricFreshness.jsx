import React from "react";

export function MetricFreshness({ at, stale }) {
  if (!at) return null;
  return (
    <p className={`mt-2 text-xs ${stale ? "font-medium text-amber-800" : "text-slate-500"}`}>
      {stale ? "Stale · " : ""}Updated{" "}
      <time dateTime={at.toISOString()} title={at.toLocaleString()}>{at.toLocaleTimeString()}</time>
    </p>
  );
}
