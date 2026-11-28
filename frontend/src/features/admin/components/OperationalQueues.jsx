import React from "react";
import { ClipboardCheck, Headphones, RotateCcw, Scale, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../../../components/ui/card";
import { getKycQueueSummary } from "../services/adminKycApi";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { MetricFreshness } from "./MetricFreshness";

const number = new Intl.NumberFormat("en-IN");

const unavailableQueues = [
  { title: "Refund Requests", icon: RotateCcw, detail: "Requires a refund request and approval workflow." },
  { title: "Reconciliation Exceptions", icon: Scale, detail: "Requires an active payment reconciliation feed." },
  { title: "Open Support Tickets", icon: Headphones, detail: "Requires a connected support ticket system." },
];

const waitBuckets = [
  { key: "underOneHour", label: "Under 1h", color: "bg-blue-600" },
  { key: "oneToSixHours", label: "1–6h", color: "bg-violet-400" },
  { key: "overSixHours", label: "Over 6h", color: "bg-violet-700" },
  { key: "unknownWait", label: "Unknown wait", color: "bg-slate-400" },
];

function formatWait(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function WaitDistribution({ total, distribution }) {
  const buckets = waitBuckets.filter(({ key }) => key !== "unknownWait" || distribution[key] > 0);
  return (
    <div className="mt-3">
      <div aria-hidden="true" className="admin-glass-track flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {buckets.map(({ key, color }) => (
          <span key={key} className={color} style={{ flexBasis: `${distribution[key] / total * 100}%` }} />
        ))}
      </div>
      <ul aria-label="KYC waiting-time distribution" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
        {buckets.map(({ key, label, color }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${color}`} />
            <span>{label} <strong className="tabular-nums">{number.format(distribution[key])} ({Math.round(distribution[key] / total * 100)}%)</strong></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueueCard({ title, icon: Icon, children }) {
  return (
    <Card className="admin-glass-card h-full gap-0 rounded-xl border py-0 ring-0">
      <CardContent className="flex h-full flex-col p-3">
        <div className="flex min-h-8 items-start justify-between gap-2">
          <h3 className="pt-0.5 text-sm font-semibold leading-[1.2] text-slate-950">{title}</h3>
          <span className="admin-glass-icon grid size-8 shrink-0 place-items-center rounded-[10px] text-blue-700">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function OperationalQueues() {
  const metric = useDashboardMetric(getKycQueueSummary, 30_000, { invalidateOn: "payteam:kyc-reviewed" });
  const { data: summary, failed, retry } = metric;

  return (
    <section aria-labelledby="operational-queues-heading" className="admin-glass-section rounded-2xl border p-2.5 sm:p-3">
      <div className="admin-glass-section-heading mb-2 flex items-center gap-3">
        <span className="admin-glass-icon grid size-9 shrink-0 place-items-center rounded-[10px] text-violet-700">
          <Users aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="operational-queues-heading" className="text-xl font-bold tracking-tight text-slate-950">Operational Queues</h2>
          <p className="text-sm text-[#354875]">What needs review?</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <QueueCard title="KYC Cases Waiting for Review" icon={ClipboardCheck}>
          {summary ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-950">{number.format(summary.total)}</p>
                {summary.averageWaitSeconds != null && (
                  <span title="Average wait for cases with a valid submission timestamp" className="admin-glass-chip rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                    Avg. {formatWait(summary.averageWaitSeconds)}
                  </span>
                )}
              </div>
              {summary.total > 0 ? (
                <WaitDistribution total={summary.total} distribution={summary.distribution} />
              ) : (
                <p className="mt-1 text-sm text-slate-600">No KYC cases awaiting review.</p>
              )}
            </>
          ) : (
            <p role="status" className="mt-2 text-sm font-medium text-slate-600">
              {failed ? "Could not load the KYC queue." : "Loading KYC queue…"}
            </p>
          )}
          <MetricFreshness {...metric} />
          {failed && summary && <p role="status" className="mt-1 text-xs text-amber-800">Could not refresh the KYC queue.</p>}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <Link to="/admin/kyc" className="rounded-md text-sm font-semibold text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">
              Open KYC queue
            </Link>
            {failed && (
              <button type="button" onClick={retry} className="cursor-pointer rounded-md text-sm font-semibold text-slate-700 underline">
                Retry
              </button>
            )}
          </div>
        </QueueCard>

        {unavailableQueues.map(({ title, icon, detail }) => (
          <QueueCard key={title} title={title} icon={icon}>
            <p className="mt-1 text-sm font-semibold text-slate-600">Unavailable</p>
            <p className="mt-1 text-xs leading-[1.35] text-slate-600">{detail}</p>
          </QueueCard>
        ))}
      </div>
    </section>
  );
}
