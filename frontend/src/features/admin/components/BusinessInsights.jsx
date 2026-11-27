import React from "react";
import { Link } from "react-router-dom";
import { Tooltip } from "@base-ui/react/tooltip";
import { ChartNoAxesCombined, Gift, Info, Lightbulb, Users } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/card";
import { fetchBusinessInsights } from "../services/adminApi";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { MetricFreshness } from "./MetricFreshness";

const number = new Intl.NumberFormat("en-IN");
const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });

function MetricTooltip({ label, children }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger type="button" aria-label={label} className="inline-grid size-7 shrink-0 cursor-help place-items-center rounded-full text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">
        <Info aria-hidden="true" className="size-4" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className="z-50" sideOffset={6}>
          <Tooltip.Popup className="max-w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-md">
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function InsightCard({ title, icon: Icon, tooltip, children }) {
  return (
    <Card className="gap-0 border border-[#e4e5fa] bg-white py-0 shadow-sm ring-0">
      <CardContent className="p-3.5 sm:p-4">
        <div className="mb-2 flex items-center gap-1">
          {Icon && <Icon aria-hidden="true" className="mr-1 size-4 text-emerald-700" />}
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          {tooltip && <MetricTooltip label={`About ${title}`}>{tooltip}</MetricTooltip>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function KycFunnel({ funnel, status, window }) {
  if (!funnel) return <p role="status" className="text-sm text-slate-600">{status}</p>;
  if (funnel.totalCases === 0) {
    return <p role="status" className="text-sm text-slate-600">No customer KYC cases opened in this period.</p>;
  }

  const cohortUrl = window ? `/admin/kyc?from=${window.start}&to=${window.end}` : null;
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">
        {cohortUrl ? <Link to={cohortUrl} className="font-semibold text-blue-800 underline">{number.format(funnel.totalCases)} customer cases</Link>
          : `${number.format(funnel.totalCases)} customer cases`} opened in this period. Bars show current progress.
      </p>
      <ol aria-label="KYC step completion" className="space-y-2.5">
        {funnel.steps.map(({ step, label, completed }) => {
          const share = completed / funnel.totalCases;
          return (
            <li key={step}>
              <div className="mb-1 flex items-center justify-between gap-2">
                {cohortUrl ? <Link to={`${cohortUrl}&step=${step}`} className="text-sm leading-5 text-blue-800 hover:underline">{step}. {label}</Link>
                  : <span className="text-sm leading-5 text-slate-800">{step}. {label}</span>}
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">
                  {number.format(completed)} ({percent.format(share)})
                </span>
              </div>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-blue-50">
                <div className="h-full rounded-full bg-linear-to-r from-blue-700 to-blue-500" style={{ width: `${share * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 rounded-lg bg-blue-50 px-2.5 py-2 text-xs text-slate-700">
        {cohortUrl ? <Link to={`${cohortUrl}&status=approved`} className="font-semibold text-blue-800 underline">{number.format(funnel.approvedCases)} approved after review</Link>
          : `${number.format(funnel.approvedCases)} approved after review`} ({percent.format(funnel.approvedCases / funnel.totalCases)} of cases opened)
      </p>
    </>
  );
}

function Insight({ icon: Icon, color, title, value, detail, to }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${color}`}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div>
        <dt className="text-sm font-medium text-slate-800">{to ? <Link to={to} className="text-blue-800 hover:underline">{title}</Link> : title}</dt>
        <dd className="font-semibold tabular-nums text-slate-950">{value}</dd>
        <dd className="text-xs leading-5 text-slate-600">{detail}</dd>
      </div>
    </div>
  );
}

export function BusinessInsights({ filter, refreshVersion }) {
  const current = useDashboardMetric(loadInsights, 60_000, { params: filter, refreshVersion });
  const status = current?.failed ? "Could not load" : "Loading…";
  const data = current?.data;

  return (
    <div className="min-w-0">
      <Tooltip.Provider>
        {current?.failed && (
          <p role="status" className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
            Could not refresh the KYC funnel and active customer count.{data ? " Showing the last successful values." : ""}{" "}
            <button type="button" onClick={current.retry} className="cursor-pointer font-semibold underline">
              Retry
            </button>
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <InsightCard title="KYC Funnel" tooltip="Each bar counts cases that currently completed this step and every preceding step. Approval reflects the review outcome for the same cohort.">
            <KycFunnel funnel={data?.kycFunnel} status={status} window={data?.window} />
            <MetricFreshness {...current} />
          </InsightCard>

          <InsightCard title="Revenue Trend" tooltip="Requires dated platform earnings postings for the selected period, including adjustments.">
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-700">Unavailable</p>
              <p className="mt-1 text-slate-600">A platform earnings ledger is required to chart revenue.</p>
            </div>
          </InsightCard>

          <InsightCard title="Quick Insights" icon={Lightbulb} tooltip="Active customers is a current account-status snapshot. Revenue growth and scheme participation require operational data sources.">
            <dl className="space-y-3">
              <Insight icon={ChartNoAxesCombined} color="bg-emerald-50 text-emerald-700" title="Revenue growth" value="Unavailable" detail="Requires comparable earnings periods." />
              <Insight icon={Users} color="bg-violet-50 text-violet-700" title="Active customers"
                to={data ? "/admin/users?customers=active" : undefined}
                value={data ? number.format(data.activeCustomers) : status}
                detail={data ? `Of ${number.format(data.totalCustomers)} registered customers${data.totalCustomers ? ` (${percent.format(data.activeCustomers / data.totalCustomers)})` : ""} · current snapshot.` : "Enabled customer accounts · current snapshot."} />
              <MetricFreshness {...current} />
              <Insight icon={Gift} color="bg-orange-50 text-orange-700" title="Scheme participation" value="Unavailable" detail="Requires a scheme enrolment or usage record." />
            </dl>
          </InsightCard>
        </div>
      </Tooltip.Provider>
    </div>
  );
}

const loadInsights = (signal, filter) => fetchBusinessInsights(filter, signal);
