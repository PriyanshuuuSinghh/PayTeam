import { ArrowUpRight, BadgeCheck, Hourglass, UserPlus, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { KycOverview, Metric, PanelHeading, PanelLink, RingPanel, ServiceTiles } from "../../../components/workspace/DashboardPanels";
import { fetchAccountSummary, fetchBusinessInsights, fetchBusinessPerformance } from "../services/adminApi";
import { getKycQueueSummary, listAdminKycApplications } from "../services/adminKycApi";
import { useDashboardMetric } from "../hooks/useDashboardMetric";
import { count, metricState, formatMoney } from "../../../components/workspace/format";
import { OnboardingChart } from "./OnboardingChart";
import { BusinessPerformance } from "./BusinessPerformance";
import { OperationalQueues } from "./OperationalQueues";
import { PlatformHealth } from "./PlatformHealth";

const period = { period: "30d" };
const loadPerformance = signal => fetchBusinessPerformance(period, signal);
const loadInsights = signal => fetchBusinessInsights(period, signal);
const loadRecent = async signal => {
  const result = await listAdminKycApplications({ page: 1, limit: 5 }, signal);
  if (!Array.isArray(result?.applications)) throw new Error("Invalid KYC applications");
  return result.applications;
};
const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function DashboardOverview({ customerDirectory, refreshVersion, onBusinessRefreshComplete, onRefreshBusiness, isRefreshingBusiness }) {
  const refresh = { invalidateOn: "payteam:kyc-reviewed" };
  const business = useDashboardMetric(loadPerformance, 60000, { refreshVersion });
  const insights = useDashboardMetric(loadInsights, 60000, refresh);
  const summary = useDashboardMetric(fetchAccountSummary, 60000, refresh);
  const queue = useDashboardMetric(getKycQueueSummary, 30000, refresh);
  const recent = useDashboardMetric(loadRecent, 30000, refresh);
  const accounts = summary.data;
  const customers = insights.data;
  const signups = business.data?.signups;
  const periodWindow = business.data?.window;
  const reviewItems = [
    { label: "Approved", value: accounts?.approved, tone: "var(--green)" },
    { label: "Awaiting review", value: accounts?.awaitingReview, tone: "var(--coral)" },
    { label: "Rejected", value: accounts?.rejected, tone: "var(--graph-gray)" },
  ];
  const failed = [business, insights, summary, queue, recent].filter(result => result.failed);
  return <div className="gw-board"><h1 className="sr-only">PayTeam admin dashboard</h1>
    {failed.length > 0 && <div className="gw-feedback" role="alert">Some dashboard data could not refresh. <button onClick={() => failed.forEach(item => item.retry())}>Retry</button></div>}
    <div className="gw-metrics">
      <Metric primary title="Customer wallet balances" icon={Wallet} value={formatMoney(business.data?.walletBalance?.amount)} result={business} detail="Aggregate across customer wallets"/>
      <Metric title="Total customers" icon={Users} value={customers?.totalCustomers} result={insights} to={customerDirectory} detail="Registered customers"/>
      <Metric title="KYC pending" icon={Hourglass} value={queue.data?.total} result={queue} to="/admin/kyc" detail="Awaiting review"/>
      <Metric title="Active customers" icon={BadgeCheck} value={customers?.activeCustomers} result={insights} to="/admin/users?customers=active" detail="Enabled accounts"/>
      <Metric title="New signups" icon={UserPlus} value={signups?.current} result={business}
        to={periodWindow && `/admin/users?customers=signups&from=${periodWindow.start}&to=${periodWindow.end}`} detail="Last 30 days"/>
    </div>
    <div className="gw-analytics"><OnboardingChart result={insights}/>
      <RingPanel title="KYC review status" detail="Submitted cases by review outcome" items={reviewItems}
        total={accounts && accounts.approved + accounts.rejected + accounts.awaitingReview} unit="Cases" result={summary}/></div>
    <div className="gw-shortcuts"><ServiceTiles/><KycOverview label="Verified customers" value={accounts ? count.format(accounts.approved) : metricState(summary)}
      detail={queue.data ? count.format(queue.data.total) + " customer applications awaiting review." : metricState(queue)} to="/admin/kyc?status=approved"/></div>
    <section className="gw-panel gw-table-panel">
      <PanelHeading title="KYC review queue" detail="Customer applications awaiting a decision"><PanelLink to="/admin/kyc">View all applications</PanelLink></PanelHeading>
      <div className="gw-table-wrap"><table><thead><tr>{["Submitted (IST)", "Customer", "Case", "Status", ""].map(l => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{recent.data?.length ? recent.data.map(row => <tr key={row.case_id}>
          <td>{row.submitted_at && Number.isFinite(Date.parse(row.submitted_at)) ? date.format(new Date(row.submitted_at)) : "Unavailable"}</td>
          <td>{row.name}</td><td>#{row.case_id}</td><td><span className="gw-status">{row.kyc_status.replaceAll("_"," ")}</span></td>
          <td><Link title="View customer profile" aria-label={"View profile for " + row.name} to={"/admin/users/" + row.user_id}><ArrowUpRight size={16}/></Link></td>
        </tr>) : <tr><td colSpan={5}><div className="gw-table-empty">{recent.data ? "No applications awaiting review." : metricState(recent)}</div></td></tr>}</tbody>
      </table></div>
    </section>
    <DashboardOperations
      refreshVersion={refreshVersion}
      onBusinessRefreshComplete={onBusinessRefreshComplete}
      onRefreshBusiness={onRefreshBusiness}
      isRefreshingBusiness={isRefreshingBusiness}
    />
  </div>;
}

export function DashboardOperations({ refreshVersion, onBusinessRefreshComplete, onRefreshBusiness, isRefreshingBusiness }) {
  return (
    <div className="payteam-admin-glass space-y-3 rounded-2xl p-3 sm:space-y-4">
      <PlatformHealth />
      <OperationalQueues />
      <div className="flex justify-end">
        <button type="button" className="gw-chip" disabled={isRefreshingBusiness} onClick={onRefreshBusiness}>
          Refresh business metrics
        </button>
      </div>
      <BusinessPerformance refreshVersion={refreshVersion} onRefreshComplete={onBusinessRefreshComplete} />
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
