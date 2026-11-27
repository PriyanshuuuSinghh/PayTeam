import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, CircleCheck, LockKeyhole, ReceiptText } from "lucide-react";
import { services } from "./catalog";

import { count, metricState } from "./format";

function Count({ value }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  useEffect(() => {
    if (reduced || !Number.isSafeInteger(value) || value <= 0) return;
    const element = ref.current;
    const animation = { frame: 0 };
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / 680);
      element.textContent = count.format(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) animation.frame = requestAnimationFrame(tick);
    }
    animation.frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation.frame);
  }, [reduced, value]);
  return <span ref={ref} aria-label={count.format(value)}>{count.format(value)}</span>;
}

export function Metric({ title, icon: Icon, value, detail, result, primary, to }) {
  const Tag = to ? Link : "article";
  return <Tag {...(to && { to })} className={"gw-panel gw-metric" + (primary ? " gw-emerald" : "")}>
    <div className="gw-metric-heading">{title}<span className="gw-icon"><Icon size={17}/></span></div>
    <strong className={value == null ? "gw-no-value" : ""}>{typeof value === "number" ? <Count value={value}/> : value ?? metricState(result)}</strong>
    <small>{result?.failed || result?.stale ? "Refresh failed · check latest data" : detail}</small>
  </Tag>;
}

export function PanelHeading({ title, detail, children }) {
  return <div className="gw-panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{children}</div>;
}

export function ServiceTiles() {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const el = track.current;
    const sync = () => setEdges({ start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    el.addEventListener("scroll", sync);
    return () => { observer.disconnect(); el.removeEventListener("scroll", sync); };
  }, []);
  function scroll(direction) { track.current.scrollBy({ left: direction * track.current.clientWidth * .7, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }
  return <section className="gw-panel gw-services" id="services" tabIndex={-1}>
    <PanelHeading title="Quick services" detail="Payment services are currently unavailable.">
      <div className="gw-tile-arrows"><button aria-label="Previous services" disabled={edges.start} onClick={() => scroll(-1)}><ChevronLeft size={14}/></button><button aria-label="More services" disabled={edges.end} onClick={() => scroll(1)}><ChevronRight size={14}/></button></div>
    </PanelHeading>
    <div className="gw-service-track" ref={track}>{services.map(({ name, icon: Icon, color }) =>
      <div id={"service-" + name} key={name} className="gw-service" role="group" tabIndex={-1} aria-label={name + " unavailable"}>
        <Icon data-tone={color} size={24}/><span>{name}</span>
      </div>)}</div>
  </section>;
}

export function RingPanel({ title, detail, items, total, unit, result }) {
  const [hovered, setHovered] = useState(null);

  return <section className="gw-panel gw-ring-panel">
    <PanelHeading title={title} detail={detail}/>
    <div className="gw-ring-content"><div className="gw-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="gw-ring-track" cx="60" cy="60" r="51"/>
        {total > 0 && items.map(({ label, value, tone }, index) => {
          const start = items.slice(0, index).reduce((sum, item) => sum + item.value, 0) * 100 / total;
          const length = value * 100 / total;
          return value > 0 && <circle key={label} className="gw-ring-piece" cx="60" cy="60" r="51" pathLength="100"
            transform="rotate(-90 60 60)" style={{ stroke: tone, "--arc": String(Math.max(0, length - (length < 100 ? .3 : 0))), opacity: hovered && hovered !== label ? .5 : 1 }}
            strokeDasharray={Math.max(0, length - (length < 100 ? .3 : 0)) + " 100"} strokeDashoffset={-start}/>;
        })}</svg><div className="gw-ring-value"><strong>{total == null ? "—" : count.format(total)}</strong><small>{unit}</small></div>
      </div><ul className="gw-legend">{items.map(({ label, value, tone }) => <li key={label} tabIndex={0}
        onMouseEnter={() => setHovered(label)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(label)} onBlur={() => setHovered(null)}
        title={total > 0 ? Math.round(value * 100 / total) + "% of " + unit.toLowerCase() : undefined}>
        <i style={{ background: tone }}/><span>{label}</span><b>{value == null ? "—" : count.format(value)}</b></li>)}</ul>
    </div>{total == null && <small role="status">{metricState(result)}</small>}{result?.failed && total != null && <small>Showing last successful values</small>}
  </section>;
}

export function KycOverview({ to, label, value, detail }) {
  return <section className="gw-panel gw-kyc"><PanelHeading title="KYC overview"/>
    <Link className="gw-kyc-link" to={to}><CircleCheck size={19}/><span>{label}</span><strong>{value}</strong><ChevronRight size={16}/></Link><p>{detail}</p>
  </section>;
}

export function TransactionPanel({ admin = false }) {
  return <section className="gw-panel gw-table-panel" id="transactions" tabIndex={-1}>
    <PanelHeading title="Recent transactions" detail={admin ? "Customer payments across services" : "Your payment and recharge history"}><LockKeyhole size={17}/></PanelHeading>
    <div className="gw-table-wrap"><table><thead><tr>{["Date & time", "Service", "Description", "Amount", "Status"].map(title => <th key={title}>{title}</th>)}</tr></thead>
      <tbody><tr><td colSpan="5"><div className="gw-table-empty"><ReceiptText size={23}/><strong>Transaction history unavailable</strong><span>The payment ledger is not connected.</span></div></td></tr></tbody></table></div>
  </section>;
}

export function PanelLink({ to, children }) {
  return <Link to={to} className="gw-chip">{children}<ArrowUpRight size={15}/></Link>;
}
