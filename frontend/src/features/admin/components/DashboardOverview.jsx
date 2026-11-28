import { PanelHeading } from "../../../components/workspace/DashboardPanels";
import { count, metricState } from "../../../components/workspace/format";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { fetchAccountSummary } from "../services/adminApi";
import { BusinessPerformance } from "./BusinessPerformance";
import { OperationalQueues } from "./OperationalQueues";
import { PlatformHealth } from "./PlatformHealth";

export function DashboardOverview() {
  return (
    <div className="payteam-admin-glass space-y-3 rounded-2xl p-3 sm:space-y-4">
      <BusinessPerformance />
      <OperationalQueues />
      <PlatformHealth />
    </div>
  );
}

export function AccountSummary() {
  const result = useDashboardMetric(fetchAccountSummary, 60000, { invalidateOn: "payteam:kyc-reviewed" });
  const accounts = result.data;
  return <section className="gw-panel"><PanelHeading title="Account summary" detail="Current snapshot across all account roles"/>
    <dl className="gw-account-details">{[["Total accounts", accounts?.total], ["Active accounts", accounts?.active],
      ["Approved KYC", accounts?.approved], ["Awaiting review", accounts?.awaitingReview], ["Rejected KYC", accounts?.rejected]].map(([label,value]) =>
      <div key={label}><dt>{label}</dt><dd>{value == null ? metricState(result) : count.format(value)}</dd></div>)}</dl>
    {result.failed && <button onClick={result.retry}>Refresh account summary</button>}
  </section>;
}
