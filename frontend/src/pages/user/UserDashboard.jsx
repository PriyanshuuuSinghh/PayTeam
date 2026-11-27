import { ClipboardList, IdCard, LockKeyhole, UserRound, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getKycStatus } from "../../api/kyc.api";
import { interpretKycStatus } from "../../features/kyc/utils/kycFlow";
import { useDashboardMetric } from "../../features/admin/hooks/useDashboardMetric";
import { KycOverview, Metric, PanelHeading, PanelLink, RingPanel, ServiceTiles, TransactionPanel } from "../../components/workspace/DashboardPanels";

import { metricState } from "../../components/workspace/format";

async function loadKyc(signal) {
  const { data } = await getKycStatus(signal);
  return { ...interpretKycStatus(data), hasCase: data.hasCase };
}

export default function UserDashboard() {
  const { user } = useAuth();
  const result = useDashboardMetric(loadKyc, 60000);
  const kyc = result.data;
  const done = kyc?.completedSteps.length;
  const status = kyc && (kyc.hasCase ? kyc.status.replaceAll("_", " ") : "Not started");
  const steps = [{ label: "Completed", value: done, tone: "var(--green)" },
    { label: "Remaining", value: kyc && 7 - done, tone: "var(--graph-gray)" }];
  return <div className="gw-board"><h1 className="sr-only">PayTeam customer dashboard</h1>
    {result.failed && <div className="gw-feedback" role="alert">Could not refresh KYC status. <button onClick={result.retry}>Retry</button></div>}
    <div className="gw-metrics">
      <Metric primary title="Wallet balance" icon={Wallet} detail="Balance feed unavailable"/>
      <Metric title="Account status" icon={UserRound} value={user?.status} detail="Personal account" to="/user/profile"/>
      <Metric title="KYC status" icon={IdCard} value={status} detail="Identity verification" to="/kyc" result={result}/>
      <Metric title="Steps completed" icon={ClipboardList} value={done} detail="Seven-step verification" result={result}/>
      <Metric title="Payment access" icon={LockKeyhole} value="Locked" detail="Services unavailable"/>
    </div>
    <div className="gw-analytics"><section className="gw-panel gw-account">
      <PanelHeading title="Account overview" detail="Your personal PayTeam account"><PanelLink to="/user/profile">Profile</PanelLink></PanelHeading>
      <div className="gw-identity"><span className="gw-avatar"><UserRound size={29}/></span><div><strong>{user?.name || "Unavailable"}</strong><p>Customer account</p></div></div>
      <dl className="gw-account-details"><div><dt>Account ID</dt><dd>{user?.id ?? "Unavailable"}</dd></div><div><dt>Verification</dt><dd>{status ?? metricState(result)}</dd></div></dl>
    </section><RingPanel title="Verification progress" detail="Your seven onboarding steps" items={steps} total={kyc && 7} unit="Steps" result={result}/></div>
    <div className="gw-shortcuts"><ServiceTiles/><KycOverview label="Identity verification" value={status ?? metricState(result)}
      detail={kyc ? done + " of 7 steps completed." : metricState(result)} to="/kyc"/></div>
    <TransactionPanel/>
  </div>;
}
