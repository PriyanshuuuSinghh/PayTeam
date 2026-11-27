import { useEffect, useRef, useState } from "react";

export function useDashboardMetric(load, intervalMs, { params, refreshVersion, onComplete, invalidateOn } = {}) {
  const [result, setResult] = useState(null);
  const refreshRef = useRef(null);
  const seenVersion = useRef(refreshVersion);

  useEffect(() => {
    let controller;
    let disposed = false;
    let pending = false;
    let lastSuccess = 0;

    async function refresh(force = false) {
      if (disposed) return;
      if (lastSuccess && Date.now() - lastSuccess >= intervalMs * 2) {
        setResult((previous) => previous?.params === params ? { ...previous, stale: true } : previous);
      }
      if (document.hidden || controller) {
        if (force) pending = true;
        return;
      }
      pending = false;
      const version = seenVersion.current;
      controller = new AbortController();
      try {
        const data = await load(controller.signal, params);
        if (disposed) return;
        const at = new Date();
        lastSuccess = at.getTime();
        setResult({ params, data, at, failed: false, stale: false });
        onComplete?.(at, version);
      } catch {
        if (disposed) return;
        setResult((previous) => {
          const last = previous?.params === params ? previous : null;
          return { ...last, params, failed: true, stale: Boolean(last?.at) };
        });
        onComplete?.(undefined, version);
      } finally {
        controller = undefined;
        if (pending && !document.hidden && !disposed) refresh();
      }
    }

    const onVisible = () => { if (!document.hidden) refresh(); };
    const invalidate = () => refresh(true);
    refreshRef.current = invalidate;
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    if (invalidateOn) window.addEventListener(invalidateOn, invalidate);
    refresh();
    return () => {
      disposed = true;
      controller?.abort();
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
