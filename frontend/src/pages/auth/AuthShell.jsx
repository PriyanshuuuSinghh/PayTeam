import React, { useId, useState } from "react";
import { ArrowRight, ArrowLeftRight, Check, Eye, EyeOff, FileText, LayoutGrid, Smartphone, SatelliteDish, Zap, Droplet, Wifi, ShieldCheck, Pause, Play } from "lucide-react";
import "./authExperience.css";

const services = [
  { name: "BBPS", Icon: LayoutGrid, tone: "cyan" },
  { name: "Bill payments", Icon: FileText, tone: "violet" },
  { name: "Mobile recharge", Icon: Smartphone, tone: "ice" },
  { name: "DTH", Icon: SatelliteDish, tone: "violet" },
  { name: "Electricity", Icon: Zap, tone: "gold" },
  { name: "Water", Icon: Droplet, tone: "cyan" },
  { name: "Transfers", Icon: ArrowLeftRight, tone: "mint" },
  { name: "Broadband", Icon: Wifi, tone: "ice" },
];

// Vector artwork is scoped to authentication; no external image requests.
function PayTeamMark({ className }) {
  const id = useId();
  return <svg className={className} viewBox="0 0 180 244" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-a`} x1="18" y1="4" x2="167" y2="229" gradientUnits="userSpaceOnUse"><stop stopColor="#b5f5ff"/><stop offset=".32" stopColor="#37a8ff"/><stop offset=".67" stopColor="#174bf1"/><stop offset="1" stopColor="#06259d"/></linearGradient>
      <linearGradient id={`${id}-b`} x1="151" y1="22" x2="28" y2="230" gradientUnits="userSpaceOnUse"><stop stopColor="#b3f3ff"/><stop offset=".45" stopColor="#2184ff"/><stop offset="1" stopColor="#0b36ca"/></linearGradient>
      <linearGradient id={`${id}-c`} x1="25" y1="120" x2="130" y2="236" gradientUnits="userSpaceOnUse"><stop stopColor="#1539de"/><stop offset="1" stopColor="#52c8ff"/></linearGradient>
    </defs>
    <path d="M85 9Q90 1 95 9L172 135Q178 145 170 155L98 234Q90 243 82 234L10 155Q2 145 8 135Z" fill={`url(#${id}-a)`} stroke="#b1f1ff" strokeWidth="1.6"/>
    <path d="M90 5L77 126Q75 139 89 146L124 166Q135 174 128 187L98 234L170 155Q178 145 172 135L95 9Z" fill={`url(#${id}-b)`} stroke="#8fddff" strokeOpacity=".72"/>
    <path d="M8 142L77 126Q75 139 89 146L124 166Q135 174 128 187L91 239L10 155Z" fill={`url(#${id}-c)`} fillOpacity=".82"/>
    <path d="M90 7L77 126Q75 139 89 146L124 166Q135 174 128 187L91 237" stroke="#91e7ff" strokeOpacity=".65" strokeWidth="1.5"/>
  </svg>;
}

export function AuthShell({ mode, children }) {
  const [paused, setPaused] = useState(false);
  return <main className={`pt-auth ${paused ? "pt-paused" : ""}`}>
    <div className="pt-shell">
      <section className="pt-visual" aria-label="About PayTeam">
        <div className="pt-ambient" aria-hidden="true"><i/><i/><i/></div>
        <div className="pt-brand pt-brand-light"><PayTeamMark className="pt-brand-mark"/>PayTeam</div>
        <div className="pt-copy"><h2>Payments made<br/><em>effortless.</em></h2><p>One place for bills, transfers and everyday payment services.</p></div>
        <div className="pt-scene" aria-label="Payment service categories">
          <div className="pt-orbit pt-orbit-one" aria-hidden="true"/><div className="pt-orbit pt-orbit-two" aria-hidden="true"/>
          <div className="pt-pedestal" aria-hidden="true"><i/><i/></div>
          <div className="pt-core"><PayTeamMark className="pt-core-mark"/></div>
          {services.map(({ name, Icon, tone }, index) => <div className={`pt-service pt-service-${index} pt-tone-${tone}`} key={name}><Icon size={24} strokeWidth={1.8} aria-hidden="true"/><span>{name}</span></div>)}
        </div>
        <div className="pt-visual-bottom"><span>Services subject to availability and eligibility.</span><button type="button" onClick={() => setPaused(v => !v)} aria-label={paused ? "Resume decorative animation" : "Pause decorative animation"} title={paused ? "Resume animation" : "Pause animation"}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button></div>
      </section>
      <section className={`pt-form-side ${mode === "register" ? "pt-register" : ""}`}>
        <div className="pt-mobile-brand pt-brand"><PayTeamMark className="pt-brand-mark"/>PayTeam</div>
        <div className="pt-form-content">{children}</div>
        <footer className="pt-footer"><span>© {new Date().getFullYear()} PayTeam</span><span><ShieldCheck size={15}/> Account security</span></footer>
      </section>
    </div>
  </main>;
}

export function AuthHeading({ title, description }) {
  return <div className="pt-heading"><h1>{title}</h1><p>{description}</p></div>;
}

export function AuthField({ id, label, icon: Icon, error, registration, type = "text", ...props }) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  return <div className="pt-field"><label htmlFor={id}>{label}</label><div className={`pt-input-wrap ${error ? "pt-invalid" : ""}`}>{Icon && <Icon size={19} aria-hidden="true"/>}<input {...registration} {...props} id={id} type={password && visible ? "text" : type} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}/>{password && <button type="button" className="pt-eye" onClick={() => setVisible(v => !v)} disabled={props.disabled} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>}</div>{error && <p className="pt-field-error" id={`${id}-error`} role="alert">{error}</p>}</div>;
}

export function AuthButton({ busy, children, ...props }) {
  return <button type="submit" className="pt-primary" {...props} disabled={busy || props.disabled} aria-busy={busy}><span>{children}</span>{busy ? <i className="pt-spinner" aria-hidden="true"/> : <ArrowRight size={19} aria-hidden="true"/>}</button>;
}

export function AuthSuccess({ title, description, id }) {
  return <div className="pt-success" role="status"><div className="pt-success-icon"><Check size={34} strokeWidth={2.5}/></div><h2 id={id}>{title}</h2><p>{description}</p></div>;
}
