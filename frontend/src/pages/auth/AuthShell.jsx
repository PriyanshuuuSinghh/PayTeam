import React, { useId, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck, Wallet, Zap, ChartNoAxesCombined, Pause, Play } from "lucide-react";
import "./authExperience.css";

function Brand({ mobile = false }) {
  return <div className={"pt-brand" + (mobile ? " pt-mobile-brand" : "")}>
    <span className="pt-brand-rim"><img src="/payteam-mark.svg" alt=""/></span>
    <span><strong>PayTeam</strong><small>Payments for everyday life</small></span>
  </div>;
}

// Decorative vector/CSS artwork, not a balance or transaction chart.
function WalletArtwork() {
  return <div className="pt-art" aria-hidden="true">
    <div className="pt-orbit pt-orbit-back"/>
    <div className="pt-art-float"><div className="pt-wallet-back"/><div className="pt-wallet-front"><Wallet size={86} strokeWidth={1.45}/></div></div>
    <div className="pt-orbit pt-orbit-front"/>
    <i className="pt-orb pt-orb-top"/><i className="pt-orb pt-orb-small"/>
  </div>;
}

function InsightArtwork() {
  const id = useId();
  return <svg className="pt-insight-art" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#1689fa" stopOpacity=".74"/><stop offset="1" stopColor="#a0d9ff" stopOpacity=".05"/></linearGradient></defs>
    <path d="M0 111 C34 111 49 103 71 87 S108 105 132 90 S166 45 190 51 S230 79 250 53 S283 8 320 29 V120 H0Z" fill={`url(#${id})`}/>
    <path className="pt-insight-line" pathLength="1" d="M0 111 C34 111 49 103 71 87 S108 105 132 90 S166 45 190 51 S230 79 250 53 S283 8 320 29" fill="none" stroke="#fff" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
    <circle cx="190" cy="51" r="5" fill="white" className="pt-insight-point"/>
  </svg>;
}

export function AuthShell({ mode, children }) {
  const [paused, setPaused] = useState(false);
  return <main className={`pt-auth ${paused ? "pt-paused" : ""}`}>
    <div className="pt-shell">
      <section className="pt-visual" aria-label="About PayTeam">
        <Brand/>
        <div className="pt-hero">
          <div className="pt-copy"><h2>A smarter way to<br/>pay, recharge and manage</h2><p>Your account, everyday payments and transaction insights — all in one place.</p></div>
          <WalletArtwork/>
        </div>
        <div className="pt-benefits">
          <article className="pt-benefit"><span className="pt-benefit-icon"><ShieldCheck size={39} strokeWidth={1.8}/></span><div><h3>Secure sign-in</h3><p>Password and verification code protect access to your account.</p></div></article>
          <article className="pt-benefit"><span className="pt-benefit-icon pt-violet"><Zap size={39} strokeWidth={1.8}/></span><div><h3>Recharge &amp; BBPS</h3><p>Mobile, DTH and bill payments, subject to service availability.</p></div></article>
          <article className="pt-benefit pt-benefit-wide"><InsightArtwork/><span className="pt-benefit-icon"><ChartNoAxesCombined size={39} strokeWidth={1.8}/></span><div><h3>Wallet &amp; transaction insights</h3><p>Manage your wallet and track payments when available.</p></div></article>
        </div>
        <div className="pt-visual-bottom"><span>Payment services require KYC approval and eligibility.</span><button type="button" onClick={() => setPaused(v => !v)} aria-label={paused ? "Resume decorative animation" : "Pause decorative animation"} title={paused ? "Resume animation" : "Pause animation"}>{paused ? <Play size={15}/> : <Pause size={15}/>}</button></div>
      </section>
      <section className={`pt-form-side ${mode === "register" ? "pt-register" : ""}`}>
        <Brand mobile/>
        <div className="pt-form-content">{children}</div>
        <footer className="pt-footer"><span>© {new Date().getFullYear()} PayTeam</span><span><LockKeyhole size={14}/> Account security</span></footer>
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
