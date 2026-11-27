import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { count, metricState } from "../../../components/workspace/format";
import { PanelHeading } from "../../../components/workspace/DashboardPanels";

function curve(points) {
  return points.reduce((d, p, index) => {
    if (!index) return `M ${p.x} ${p.y}`;
    const last = points[index - 1];
    const mid = (last.x + p.x) / 2;
    return d + ` C ${mid} ${last.y}, ${mid} ${p.y}, ${p.x} ${p.y}`;
  }, "");
}

export function OnboardingChart({ result }) {
  const id = useId();
  const [active, setActive] = useState(null);
  const funnel = result.data?.kycFunnel;
  const steps = funnel?.steps ?? [];
  const max = Math.max(1, funnel?.totalCases ?? 0);
  const step = steps[active];
  const window = result.data?.window;
  return <section className="gw-panel gw-chart-panel">
    <PanelHeading title="Onboarding progress" detail="Customer cases opened in the last 30 days">
      <div className="gw-chart-key"><span><i/>Completed</span><span><i/>Remaining</span></div>
    </PanelHeading>
    {funnel?.totalCases > 0 && steps.length > 1 ? <div className="gw-chart">
      <div className="gw-y-axis">{[max, Math.round(max / 2), 0].map((n,i) => <span key={i}>{count.format(n)}</span>)}</div>
      <div className="gw-plot">
        <svg viewBox="0 0 600 130" preserveAspectRatio="none" role="img" aria-label="Customer cases completed and remaining at each of seven onboarding steps">
          <defs>{["coral", "gray"].map((color,i) => <linearGradient id={id + color} key={color} x1="0" y1="0" x2="0" y2="1"><stop stopColor={i ? "#757682" : "#c84145"} stopOpacity=".31"/><stop offset="1" stopColor={i ? "#757682" : "#c84145"} stopOpacity=".02"/></linearGradient>)}</defs>
          {["gray", "coral"].map(color => {
            const points = steps.map(({ completed }, i) => ({ x: i * 600 / (steps.length - 1), y: 126 - 122 * (color === "coral" ? completed : max - completed) / max }));
            const path = curve(points);
            return <g key={color}><path d={path + " L600 130 L0 130 Z"} fill={`url(#${id + color})`}/><path className="gw-curve" pathLength="1" d={path} fill="none" stroke={color === "coral" ? "var(--coral)" : "var(--graph-gray)"} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></g>;
          })}
        </svg>
        {steps.map(({ step: n, label, completed }, i) => <Link key={n} className="gw-chart-hit" style={{ left: (i * 100 / (steps.length - 1)) + "%" }}
          aria-label={`Step ${n}, ${label}, ${completed} completed out of ${max}. View cases.`}
          to={`/admin/kyc?from=${window.start}&to=${window.end}&step=${n}`}
          onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}><span>Step {n}</span></Link>)}
        {step && <div className="gw-chart-tip" role="status">Step {step.step} · {step.label}<br/>{step.completed} completed · {max - step.completed} remaining</div>}
      </div>
    </div> : <div className="gw-chart-empty">{funnel ? "No customer cases opened in this period." : metricState(result)}</div>}
  </section>;
}
