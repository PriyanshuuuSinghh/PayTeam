import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, BarChart3, CalendarDays, Plus, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";
import { BusinessInsights } from "./BusinessInsights";
import { MetricFreshness } from "./MetricFreshness";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { fetchBusinessPerformance } from "../services/adminApi";

import { formatMoney } from "../../../components/workspace/format";

const periods = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];
const integer = new Intl.NumberFormat("en-IN");
const percent = new Intl.NumberFormat("en-IN", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const todayInIndia = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" });
const focus = "focus-visible:outline-2 focus-visible:outline-blue-600";


function BusinessMetric({ title, icon: Icon, accent, value, detail, change, freshness, to, appearance = "", status = "Unavailable" }) {
  return (
    <div className={`admin-glass-tile relative min-w-0 rounded-xl border p-2.5 ${appearance}`}>
      <span className={`admin-glass-icon mb-1.5 grid size-8 place-items-center rounded-[10px] ${accent}`}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <h4 className="text-sm font-medium leading-5 text-slate-800">
        {to ? <Link to={to} className="text-blue-800 hover:underline after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-blue-600">{title}</Link> : title}
      </h4>
      <p className={`mt-1 break-words tabular-nums ${value == null ? "text-sm font-semibold text-slate-600" : "text-xl font-bold tracking-tight text-slate-950"}`}>
        {value ?? status}
      </p>
      {change != null && (
        <p className={`mt-1 text-xs font-semibold ${change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-600"}`}>
          {percent.format(change / 100)} vs. previous period
        </p>
      )}
      {detail && <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>}
      {freshness && <MetricFreshness {...freshness} />}
    </div>
  );
}

const loadPerformance = (signal, filter) => fetchBusinessPerformance(filter, signal);

export function BusinessPerformance({ refreshVersion = 0, onRefreshComplete }) {
  const [filter, setFilter] = useState({ period: "24h" });
  const [customOpen, setCustomOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const onComplete = useCallback((at, version) => onRefreshComplete?.({ version, at }), [onRefreshComplete]);
  const currentResult = useDashboardMetric(loadPerformance, 60_000, { params: filter, refreshVersion, onComplete });
  const signups = currentResult?.data?.signups;
  const wallet = currentResult?.data?.walletBalance;
  const window = currentResult.data?.window;
  const status = currentResult.failed ? "Could not load" : currentResult.loading ? "Loading…" : "Unavailable";

  return (
    <section aria-labelledby="business-performance-heading" className="admin-glass-section rounded-2xl border p-2.5 sm:p-3">
      <div className="admin-glass-section-heading mb-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <span className="admin-glass-icon grid size-9 shrink-0 place-items-center rounded-[10px] text-violet-700">
            <BarChart3 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="business-performance-heading" className="text-xl font-bold tracking-tight text-slate-950">Business Performance</h2>
            <p className="text-sm text-[#354875]">Customer growth and wallet activity</p>
          </div>
        </div>

        <div role="group" aria-label="Business performance period" className="admin-glass-inset flex flex-wrap items-center gap-1 rounded-full border p-1">
          {periods.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter.period === value}
              onClick={() => { setCustomOpen(false); setFilter({ period: value }); }}
              className={`rounded-full px-2.5 py-1.5 text-sm font-semibold ${focus} ${filter.period === value ? "admin-glass-selected bg-blue-800 text-white" : "admin-glass-control bg-blue-50 text-blue-900 hover:bg-blue-100"}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-label="Custom date range"
            aria-expanded={customOpen}
            aria-controls="business-performance-date-range"
            title={filter.period === "custom" ? `${filter.startDate} to ${filter.endDate} (IST)` : "Custom date range"}
            onClick={() => setCustomOpen((open) => !open)}
            className={`rounded-full p-2 ${focus} ${filter.period === "custom" ? "admin-glass-selected bg-blue-800 text-white" : "admin-glass-control text-blue-800 hover:bg-blue-50"}`}
          >
            <CalendarDays aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {customOpen && (
        <form
          id="business-performance-date-range"
          className="admin-glass-inset mb-3 flex flex-wrap items-end gap-3 rounded-xl border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ period: "custom", startDate, endDate });
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            From (IST)
            <input required type="date" max={endDate || todayInIndia.format()} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={`rounded-lg border border-slate-200 px-2 py-1.5 ${focus}`} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Through (IST)
            <input required type="date" min={startDate || undefined} max={todayInIndia.format()} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={`rounded-lg border border-slate-200 px-2 py-1.5 ${focus}`} />
          </label>
          <button type="submit" className={`admin-glass-selected rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white ${focus}`}>Apply</button>
        </form>
      )}

      <div className="grid items-start gap-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,2.6fr)]">
        <Card className="admin-glass-card min-w-0 gap-0 border py-0 ring-0">
          <CardContent className="p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-950">Key Business Metrics</h3>
              {filter.period === "custom" && (
                <p className="text-xs text-slate-600">{filter.startDate} to {filter.endDate} · IST</p>
              )}
            </div>
            {currentResult?.failed && (
              <p role="status" className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
                Could not refresh business metrics.{currentResult.data ? " Showing the last successful values." : ""}{" "}
                <button type="button" className={`font-semibold underline ${focus}`} onClick={currentResult.retry}>Retry</button>
              </p>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-2">
              <BusinessMetric title="New Customer Signups" icon={Users} accent="bg-blue-100 text-blue-800"
                value={signups ? integer.format(signups.current) : null} status={status} change={signups?.changePercent}
                freshness={currentResult}
                to={window ? `/admin/users?customers=signups&from=${window.start}&to=${window.end}` : undefined}
                detail={signups ? `${integer.format(signups.previous)} signups in the previous period` : undefined} />
              <BusinessMetric title="Aggregate customer wallet balance" icon={Wallet} accent="bg-emerald-100 text-emerald-800" appearance="admin-glass-wallet"
                value={formatMoney(wallet?.amount)} status={status} freshness={currentResult} detail={wallet?.amount === null
                  ? "Some customer wallets are missing."
                  : "Current snapshot. Historical balances unavailable."} />
              <BusinessMetric title="Money Added" icon={Plus} accent="bg-violet-100 text-violet-800"
                detail="Requires posted external funding entries." />
              <BusinessMetric title="Money Withdrawn" icon={ArrowDownToLine} accent="bg-orange-100 text-orange-800"
                detail="Requires posted external withdrawal entries." />
            </div>
          </CardContent>
        </Card>
        <BusinessInsights filter={filter} refreshVersion={refreshVersion} />
      </div>
    </section>
  );
}
