import React, { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Wallet, Plus, ArrowDownUp, IndianRupee, Gift, ChartNoAxesColumnIncreasing, LayoutGrid, History, ArrowRight, ArrowUpRight, ShieldAlert, Clock, RefreshCw, Check, X } from "lucide-react";
import { services } from "../../components/workspace/catalog";
import { count } from "../../components/workspace/format";
import FormDialog from "../../components/workspace/FormDialog";
import { getKycStatus } from "../../api/kyc.api";
import { interpretKycStatus } from "../../features/kyc/utils/kycFlow";
import { useDashboardMetric } from "../../features/admin/hooks/useDashboardMetric";
import "../../components/workspace/customer-dashboard.css";

const serviceColors = { green: "#07934a", violet: "#7944e8", amber: "#b97800", aqua: "#007bda" };
const quickServices = ["Mobile recharge", "DTH", "Electricity", "Water", "Broadband", "BBPS"].map(name => services.find(service => service.name === name));
const spendingCategories = [
  { label: "Recharges", color: "#0668f5" },
  { label: "Bill Payments", color: "#22c8ef" },
  { label: "Utilities", color: "#a170ed" },
  { label: "Others", color: "#9aaccb" },
];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

// Presentation-only contract. No fabricated balances, transactions or analytics.
// Current API does not expose customer financial read models. Null means unavailable.
const unavailableFinancials = Object.freeze({ balance: null, transactionCount: null, monthSpent: null, savings: null, trend: null, categories: null, transactions: null });

const formatAmount = (value) => value == null ? "—" : money.format(value);
const formatCount = (value) => value == null ? "—" : count.format(Math.round(value));
const enter = (reduced, order) => ({
  initial: reduced ? false : { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: reduced ? 0 : .5, delay: reduced ? 0 : order * .045, ease: [0.22, 1, 0.36, 1] },
});

function Panel({ className = "", order = 0, reduced, children, ...props }) {
  return <motion.section {...enter(reduced, order)} className={`ptg-panel ${className}`} {...props}>{children}</motion.section>;
}
function AnimatedValue({ value, format, reduced }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const target = Number(value);
    if (value == null || reduced || !Number.isFinite(target) || Math.abs(target) > Number.MAX_SAFE_INTEGER / 100) {
      setDisplay(value);
      return;
    }
    let frame;
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / 750);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(progress === 1 ? value : target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  // The animation is presentation-only; the exact final amount is available
  // to assistive technology throughout. Unavailable data never counts from zero.
  if (value == null) return "—";
  return <><span aria-hidden="true">{format(reduced ? value : display ?? value)}</span><span className="ptg-sr">{format(value)}</span></>;
}
function Metric({ title, icon: Icon, value, format, caption, savings, order, reduced }) {
  return <Panel reduced={reduced} order={order} className={`ptg-metric${savings ? " ptg-savings" : ""}`}>
    <div className="ptg-metric-label"><Icon aria-hidden="true" /><h2>{title}</h2></div>
    <strong className="ptg-metric-value"><AnimatedValue value={value} format={format} reduced={reduced} /></strong>
    <p className="ptg-metric-caption">{caption}</p>
  </Panel>;
}

// Adapted from the supplied GlassyDashboard's midpoint cubic interpolation.
export function smoothPath(points) {
  return points.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x} ${y}`;
    const [px, py] = points[index - 1];
    const midpoint = (x + px) / 2;
    return `${path} C ${midpoint} ${py}, ${midpoint} ${y}, ${x} ${y}`;
  }, "");
}

function TrendChart({ series, reduced }) {
  const fillId = `ptg-area-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [selected, setSelected] = useState(null);
  const hasData = Array.isArray(series) && series.length >= 2 && series.every(item => typeof item.label === "string" && Number.isFinite(item.amount) && item.amount >= 0);
  const width = 600, height = 150;
  const peak = hasData ? Math.max(1, ...series.map(item => item.amount)) * 1.12 : 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak / 3));
  const step = Math.ceil(peak / 3 / magnitude) * magnitude;
  const ceiling = hasData ? step * 3 : 1;
  const points = hasData ? series.map((item, index) => [index * width / (series.length - 1), height - item.amount / ceiling * height]) : [];
  const path = smoothPath(points);
  const active = hasData && selected !== null ? points[selected] : null;
  const ticks = [1, 2 / 3, 1 / 3, 0];
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
  return <figure className="ptg-trend" aria-label="Transaction amounts over time">
    <div className="ptg-chart-axis" aria-hidden="true">{ticks.map((tick, i) => <span key={i}>{hasData ? compact.format(ceiling * tick) : "—"}</span>)}</div>
    <div className="ptg-chart-body">
      <div className="ptg-chart-plot" onMouseLeave={() => setSelected(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1688ff" stopOpacity=".45" /><stop offset="1" stopColor="#1688ff" stopOpacity=".025" /></linearGradient></defs>
          {ticks.map((_, index) => <line key={index} x1="0" x2={width} y1={height * index / 3} y2={height * index / 3} className="ptg-grid-line" />)}
          {hasData && <g className={reduced ? "" : "ptg-line-reveal"}><path d={`${path} L ${width} ${height} H 0 Z`} fill={`url(#${fillId})`} /><path d={path} fill="none" stroke="#0879f9" strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" /></g>}
          {active && <><line x1={active[0]} x2={active[0]} y1={active[1]} y2={height} stroke="#1475ed" strokeDasharray="3 3" /><circle cx={active[0]} cy={active[1]} r="4" fill="#0879f9" stroke="white" strokeWidth="1.4" /></>}
        </svg>
        {hasData ? <><div className="ptg-chart-zones">{series.map((item, index) => <button key={index} type="button" aria-label={`${item.label}: ${money.format(item.amount)}`} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)} />)}</div>{active && <span className="ptg-chart-tooltip" style={{ "--ptg-point": `${selected / (series.length - 1) * 100}%` }}>{money.format(series[selected].amount)}</span>}</> : <div className="ptg-chart-empty"><History aria-hidden="true" /><strong>Transaction data unavailable</strong><span>Payment reporting is not enabled yet.</span></div>}
      </div>
      <div className="ptg-chart-months" aria-hidden="true">{hasData ? series.map((item, index) => <span key={index}>{item.label}</span>) : <span>Transaction history</span>}</div>
    </div>
  </figure>;
}

function MonthSummary({ categories, total, reduced }) {
  const maskId = `ptg-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [active, setActive] = useState(null);
  const hasData = Array.isArray(categories) && categories.length === spendingCategories.length && categories.every(value => Number.isFinite(value) && value >= 0) && categories.some(value => value > 0);
  const sum = hasData ? categories.reduce((a, b) => a + b, 0) : 0;
  const shares = hasData ? categories.map(value => value / sum * 100) : [];
  return <>
    <div className="ptg-donut" role="img" aria-label={hasData ? `Monthly spending ${formatAmount(total)}` : "Monthly spending data unavailable"}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><mask id={maskId}><circle className={hasData && !reduced ? "ptg-donut-reveal" : ""} cx="100" cy="100" r="82" fill="none" stroke="white" strokeWidth="31" pathLength="100" strokeDasharray="100 0" transform="rotate(-90 100 100)" /></mask>{spendingCategories.map(({ color }, index) => <linearGradient key={index} id={`${maskId}-${index}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={color} stopOpacity=".8" /></linearGradient>)}</defs>
        <circle cx="100" cy="100" r="82" fill="none" stroke="var(--ptg-track)" strokeWidth="29" />
        {hasData && <g mask={`url(#${maskId})`} transform="rotate(-90 100 100)">{shares.map((share, index) => <circle key={index} cx="100" cy="100" r="82" fill="none" stroke={`url(#${maskId}-${index})`} strokeWidth="29" pathLength="100" strokeDasharray={`${Math.max(0, share - .35)} 100`} strokeDashoffset={-shares.slice(0, index).reduce((a, b) => a + b, 0)} className="ptg-donut-segment" opacity={active === null || active === index ? 1 : .35} />)}</g>}
        <circle cx="100" cy="100" r="97" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.2" /><circle cx="100" cy="100" r="67" fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="1.2" />
      </svg>
      <div className="ptg-donut-center"><strong>{active !== null && hasData ? money.format(categories[active]) : formatAmount(total)}</strong><span>{active !== null && hasData ? spendingCategories[active].label : "Total Spent"}</span></div>
    </div>
    <div className="ptg-category-list">{spendingCategories.map(({ label, color }, index) => {
      const row = <><i aria-hidden="true" style={{ "--ptg-category": color }} /><span>{label}</span><strong>{hasData ? `${Number(shares[index].toFixed(1))}%` : "—"}</strong></>;
      return hasData ? <button type="button" key={label} aria-pressed={active === index} onClick={() => setActive(active === index ? null : index)}>{row}</button> : <div key={label}>{row}</div>;
    })}</div>
  </>;
}

function KycNotice({ kyc, retryKyc }) {
  if (kyc.status === "approved" || kyc.status === "loading") return null;
  const review = ["submitted", "under_review"].includes(kyc.status);
  const error = kyc.status === "error";
  const title = error ? "KYC status unavailable" : review ? "KYC application under review" : kyc.status === "rejected" ? "Your KYC application needs attention" : "Complete your identity verification";
  return <div className="ptg-kyc-notice" role="status"><span className="ptg-notice-icon">{review ? <Clock /> : <ShieldAlert />}</span><div><strong>{title}</strong><p>{error ? "We could not verify your status. Payments remain unavailable." : review ? "You can check the progress of your application." : "Complete the required steps to become eligible for payment services."}</p></div>{error ? <button className="ptg-pill" type="button" onClick={retryKyc}><RefreshCw /> Retry</button> : <Link className="ptg-pill" to="/kyc">View KYC <ArrowRight /></Link>}</div>;
}

// Financial view model is deliberately separated from the visual layer so a future
// authorized read-only API can supply real values without changing the layout.
export function DashboardContent({ financials = unavailableFinancials, kyc, retryKyc, openAction }) {
  const reduced = useReducedMotion();
  const f = financials;
  return <div className="ptg-dashboard" data-kyc-approved={kyc.status === "approved"}>
    <h1 className="ptg-sr">Customer dashboard</h1>
    <KycNotice kyc={kyc} retryKyc={retryKyc} />
    <div className="ptg-metrics">
      <Panel reduced={reduced} order={0} className="ptg-wallet" id="wallet" tabIndex={-1}>
        <div className="ptg-wallet-copy"><div className="ptg-metric-label"><Wallet aria-hidden="true" /><h2>Wallet Balance</h2></div><strong className="ptg-wallet-value"><AnimatedValue value={f.balance} format={formatAmount} reduced={reduced} /></strong>{f.balance == null && <p className="ptg-wallet-caption">Balance unavailable</p>}</div>
        <button type="button" className="ptg-add-money" onClick={() => openAction("addMoney")}><Plus aria-hidden="true" /> Add Money</button>
      </Panel>
      <Metric reduced={reduced} order={1} title="Total Transactions" icon={ArrowDownUp} value={f.transactionCount} format={formatCount} caption={f.transactionCount == null ? "Data unavailable" : "All recorded transactions"} />
      <Metric reduced={reduced} order={2} title="This Month Spent" icon={IndianRupee} value={f.monthSpent} format={formatAmount} caption={f.monthSpent == null ? "Data unavailable" : "This month"} />
      <Metric reduced={reduced} order={3} title="Total Savings" icon={Gift} savings value={f.savings} format={formatAmount} caption={f.savings == null ? "Data unavailable" : "Recorded savings"} />
    </div>
    <div className="ptg-dashboard-grid">
      <Panel className="ptg-trends-panel" reduced={reduced} order={4}><header className="ptg-panel-head"><div><h2>Transaction Trends</h2><p>Your transaction amount over time</p></div></header><TrendChart series={f.trend} reduced={reduced} /></Panel>
      <Panel className="ptg-month-panel" reduced={reduced} order={5}><header className="ptg-panel-head"><ChartNoAxesColumnIncreasing className="ptg-summary-icon" aria-hidden="true" /><div><h2>This Month Summary</h2><p>Your spending by service category</p></div></header><MonthSummary categories={f.categories} total={f.monthSpent} reduced={reduced} /></Panel>
      <Panel className="ptg-services-panel" id="services" tabIndex={-1} reduced={reduced} order={6}><header className="ptg-panel-head"><LayoutGrid aria-hidden="true" /><div><h2>Quick Services</h2><p>Pay, recharge and manage your bills</p></div><button className="ptg-pill" type="button" onClick={() => openAction("services")}>View All Services <ArrowRight aria-hidden="true" /></button></header>
        <div className="ptg-service-grid">{quickServices.map(({ name, icon: Icon, color }) => <button key={name} id={"service-" + name} type="button" onClick={() => openAction("service", name)} className="ptg-service" aria-label={`${name} — currently unavailable`}><Icon aria-hidden="true" style={{ color: serviceColors[color] }} /><span>{name}</span></button>)}</div>
      </Panel>
    </div>
    <Panel className="ptg-transactions-panel" id="transactions" tabIndex={-1} reduced={reduced} order={7}>
      <header className="ptg-panel-head"><History aria-hidden="true" /><div><h2>Recent Transactions</h2><p>Your latest payment activities</p></div><button className="ptg-pill" type="button" onClick={() => openAction("transactions")}>View All Transactions <ArrowUpRight aria-hidden="true" /></button></header>
      <div className="ptg-table-scroll"><table><thead><tr><th scope="col">Date &amp; Time</th><th scope="col">Service</th><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>
        {Array.isArray(f.transactions) && f.transactions.length ? f.transactions.slice(0, 3).map((row, index) => <tr key={row.id ?? index}><td>{row.date}</td><td><span className="ptg-table-service">{quickServices.filter(item => item.name === row.service).map(({ icon: Icon, color }) => <Icon key={row.service} aria-hidden="true" style={{ color: serviceColors[color] }} />)}{row.service}</span></td><td>{row.description}</td><td className="ptg-amount">{formatAmount(row.amount)}</td><td><span className="ptg-status" data-status={row.status}>{row.status === "Successful" && <Check aria-hidden="true" />}{row.status}</span></td></tr>) : <tr><td colSpan={5} className="ptg-table-empty"><History aria-hidden="true" /><strong>{Array.isArray(f.transactions) ? "No transactions yet" : "Transaction history unavailable"}</strong><span>{Array.isArray(f.transactions) ? "Your payments will appear here." : "Transaction reporting is not enabled yet."}</span></td></tr>}
      </tbody></table></div>
    </Panel>
  </div>;
}

async function loadKyc(signal) {
  const { data } = await getKycStatus(signal);
  return interpretKycStatus(data);
}

export default function UserDashboard() {
  const result = useDashboardMetric(loadKyc, 60000);
  const status = result.failed || result.stale ? "error" : result.loading ? "loading" : result.data?.view === "approved" ? "approved" : result.data?.status || "error";
  const kyc = { status };
  const [action, setAction] = useState(null);
  const location = useLocation();
  useEffect(() => {
    // The shared workspace search also contains services outside the six tiles.
    // Open an unavailable-service notice rather than leaving those links inert.
    let name;
    try {
      const hash = decodeURIComponent(location.hash.slice(1));
      if (hash.startsWith("service-")) name = hash.slice(8);
    } catch { /* Ignore malformed hashes. */ }
    const extra = name && services.some(service => service.name === name) && !quickServices.some(service => service.name === name);
    setAction(extra ? { kind: "service", name } : null);
  }, [location.pathname, location.hash]);
  const openAction = (kind, name) => setAction({ kind, name });
  const close = () => setAction(null);
  const title = action?.kind === "addMoney" ? "Add Money" : action?.kind === "services" ? "Payment services" : action?.kind === "transactions" ? "Transaction history" : action?.name;
  return <>
    <DashboardContent kyc={kyc} retryKyc={result.retry} openAction={openAction} />
    {action && <FormDialog title={title} close={close}>
      <div className="ptg-dialog-inner">
        <header><h2>{title}</h2><button className="gw-round" type="button" aria-label="Close dialog" onClick={close}><X size={18}/></button></header>
        {action.kind === "services" ? <div className="ptg-dialog-list">{services.map(({name, icon: Icon, color}) => <button key={name} type="button" className="ptg-dialog-row" onClick={() => openAction("service", name)}><Icon style={{color:serviceColors[color]}}/><span>{name}</span><small>Unavailable</small></button>)}</div> : <>
          <p>{action.kind === "transactions" ? "The payment ledger is not connected yet. Transaction history is unavailable." : status === "approved" ? "This payment capability is not enabled yet. No money will be moved." : status === "loading" || status === "error" ? "Your verification status could not be confirmed. Payments remain unavailable." : "Payment services require KYC approval, scheme eligibility and an enabled payment integration."}</p>
          {action.kind !== "transactions" && status !== "approved" && status !== "loading" && status !== "error" && <Link className="ptg-pill" to="/kyc" onClick={close}>View KYC <ArrowRight/></Link>}
          <button className="ptg-pill" type="button" onClick={close}>Close</button>
        </>}
      </div>
    </FormDialog>}
  </>;
}
