// The caller owns the timer and visibility listener. The poller owns one request.
export function createMetricPoller({
  load, isHidden, onSuccess, onError, onStale, intervalMs, now = Date.now,
}) {
  let controller;
  let disposed = false;
  let pending = false;
  let lastSuccess;

  async function refresh(force = false) {
    if (disposed) return;
    if (lastSuccess !== undefined && now() - lastSuccess >= intervalMs * 2) onStale();
    if (isHidden() || controller) {
      if (force) pending = true;
      return;
    }

    pending = false;
    controller = new AbortController();
    try {
      const data = await load(controller.signal);
      if (disposed) return;
      lastSuccess = now();
      onSuccess(data, new Date(lastSuccess));
    } catch {
      if (!disposed) onError();
    } finally {
      controller = undefined;
      if (pending && !isHidden() && !disposed) void refresh();
    }
  }

  return {
    refresh,
    dispose() {
      disposed = true;
      controller?.abort();
    },
  };
}
