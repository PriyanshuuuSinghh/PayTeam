import { useEffect, useRef, useState } from "react";
import { createMetricPoller } from "./metricPolling";

export function useDashboardMetric(load, intervalMs, { params, refreshVersion, onComplete, invalidateOn } = {}) {
  const [result, setResult] = useState(null);
  const refreshRef = useRef(null);
  const seenVersion = useRef(refreshVersion);
  const requestVersion = useRef(refreshVersion);

  useEffect(() => {
    const { refresh, dispose } = createMetricPoller({
      intervalMs,
      isHidden: () => document.hidden,
      load: (signal) => {
        requestVersion.current = seenVersion.current;
        return load(signal, params);
      },
      onStale: () => setResult((previous) =>
        previous?.params === params && !previous?.stale ? { ...previous, stale: true } : previous),
      onSuccess: (data, at) => {
        setResult({ params, data, at, failed: false, stale: false });
        onComplete?.(at, requestVersion.current);
      },
      onError: () => {
        setResult((previous) => {
          const last = previous?.params === params ? previous : null;
          return { ...last, params, failed: true, stale: Boolean(last?.at) };
        });
        onComplete?.(undefined, requestVersion.current);
      },
    });

    const onVisible = () => { if (!document.hidden) refresh(); };
    const invalidate = () => refresh(true);
    refreshRef.current = invalidate;
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    if (invalidateOn) window.addEventListener(invalidateOn, invalidate);
    refresh();
    return () => {
      dispose();
      refreshRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (invalidateOn) window.removeEventListener(invalidateOn, invalidate);
    };
  }, [load, intervalMs, params, onComplete, invalidateOn]);

  useEffect(() => {
    if (seenVersion.current === refreshVersion) return;
    seenVersion.current = refreshVersion;
    refreshRef.current?.();
  }, [refreshVersion]);

  const current = result?.params === params ? result : null;
  return { ...current, loading: !current, retry: () => refreshRef.current?.() };
}
