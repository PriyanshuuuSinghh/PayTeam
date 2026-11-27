import React from "react";
import { Clock3, CreditCard, TriangleAlert, Webhook, Zap } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";
import { fetchPlatformHealth } from "../services/adminApi";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { MetricFreshness } from "./MetricFreshness";

const refreshInterval = 15_000;
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const paymentSource = "Requires an active payment transaction feed.";
const metrics = [
  { title: "Payment Success Rate", icon: CreditCard, color: "bg-emerald-50 text-emerald-700", detail: paymentSource },
  { title: "Failed Transactions", icon: TriangleAlert, color: "bg-rose-50 text-rose-700", detail: paymentSource },
  { title: "Pending Too Long", icon: Clock3, color: "bg-orange-50 text-orange-700", detail: "Requires pending payments and an age threshold." },
  { title: "Webhook Backlog", icon: Webhook, color: "bg-violet-50 text-violet-700", detail: "Requires an active webhook inbox and processing states." },
  { title: "API Latency (p95)", icon: Zap, color: "bg-blue-100 text-blue-800" },
];

function LatencySparkline({ history }) {
  const values = history.filter(Number.isFinite);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const points = history.map((value, index) => Number.isFinite(value)
    ? { x: 4 + index * 152 / (history.length - 1), y: range ? 24 - (value - min) * 20 / range : 14 }
    : null);

  return (
    <svg viewBox="0 0 160 28" className="mt-2 h-8 w-full text-blue-700" role="img" aria-label="Observed p95 by completed minute, with gaps for missing samples">
      {points.map((point, index) => {
        if (!point) return null;
        const previous = points[index - 1];
        return previous
          ? <line key={index} x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke="currentColor" strokeWidth="1.5" />
          : <circle key={index} cx={point.x} cy={point.y} r="2" fill="currentColor" />;
      })}
    </svg>
  );
}

function HealthMetricCard({ metric, value, status, detail, children }) {
  const Icon = metric.icon;
  return (
    <Card className="h-full gap-0 rounded-xl border border-[#e2eaf8] bg-white py-0 shadow-sm ring-0">
      <CardContent className="flex h-full flex-col px-3.5 py-3.5">
        <div className="flex min-h-11 items-start justify-between gap-2">
          <h3 className="pt-1 text-sm font-semibold leading-5 text-slate-950">{metric.title}</h3>
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${metric.color}`}>
            <Icon aria-hidden="true" className="size-[18px]" />
          </span>
        </div>
        <p className={`mt-2 ${value == null ? "text-sm font-semibold text-slate-600" : "text-2xl font-bold tabular-nums tracking-tight text-slate-950"}`}>
          {value ?? status}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{detail}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function ErrorRateCard({ title, sample, status, detail, freshness }) {
  const { errorCount, sampleCount } = sample ?? {};
  const rate = sampleCount > 0 && Number.isInteger(errorCount) ? errorCount / sampleCount * 100 : null;
  return (
    <HealthMetricCard metric={{ title, icon: TriangleAlert, color: "bg-rose-50 text-rose-700" }}
      value={rate == null ? null : `${number.format(rate)}%`} status={status}
      detail={rate == null ? detail : `${number.format(errorCount)} of ${number.format(sampleCount)} requests · ${detail}`}>
      <MetricFreshness {...freshness} />
    </HealthMetricCard>
  );
}

export function PlatformHealth() {
  const metric = useDashboardMetric(fetchPlatformHealth, refreshInterval);
  const { data, failed } = metric;
  const snapshot = data?.apiLatency;
  let status = "Loading…";
  if (failed) status = "Could not load";
  else if (snapshot) status = "No samples yet";

  return (
    <section aria-labelledby="platform-health-heading" className="rounded-2xl border border-[#dce7fa] bg-linear-to-b from-[#eaf1fd] to-[#f8faff] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#dce8fc] text-blue-700">
            <Zap aria-hidden="true" className="size-6 fill-current" />
          </span>
          <div>
            <h2 id="platform-health-heading" className="text-xl font-bold tracking-tight text-slate-950">Platform Health</h2>
            <p className="text-sm text-[#354875]">Payments, webhooks and API performance</p>
          </div>
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-blue-800">Telemetry refreshes every 15s while visible</span>
      </div>

      <div role="status" className={failed ? "mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" : "sr-only"}>
        {failed ? `Telemetry refresh failed. ${snapshot ? "Showing the last successful values." : "The next refresh will retry."}` : ""}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.slice(0, -1).map((metric) => (
          <HealthMetricCard key={metric.title} metric={metric} status="Unavailable" detail={metric.detail} />
        ))}
        <HealthMetricCard
          metric={metrics.at(-1)}
          value={snapshot?.p95Ms == null ? null : `${number.format(snapshot.p95Ms)} ms`}
          status={status}
          detail={snapshot?.sampleCount
            ? `${number.format(snapshot.sampleCount)} requests · last ${snapshot.windowMinutes} min · this API instance`
            : "Completed requests on this API instance."}
        >
          {snapshot && <LatencySparkline history={snapshot.history} />}
          <MetricFreshness {...metric} />
        </HealthMetricCard>
        <ErrorRateCard title="API Error Rate" sample={snapshot} status={status} freshness={metric}
          detail="HTTP 5xx · last 15 min · this instance" />
        <ErrorRateCard title="IDTO Provider Error Rate" sample={data?.idtoErrors} status={status} freshness={metric}
          detail="Transport, HTTP or malformed responses · last 15 min · this instance" />
      </div>
    </section>
  );
}
