import { LockKeyhole } from "lucide-react";
export function KycUnavailable({ title }) {
  return <section className="pk-verification pk-blocked" role="status"><span className="pk-verification-icon"><LockKeyhole/></span><h3>{title} unavailable</h3><p>The required provider and approved PayTeam configuration is not available. Contact support or refresh to check again.</p></section>;
}
export function KycDisclosure({ text, checked, onChange, disabled, retention }) {
  return <div className="pk-disclosure"><p className="pk-disclosure-text">{text}</p>{retention && <p className="pk-disclosure-text">{retention}</p>}<label className="pk-consent"><input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={e => onChange(e.target.checked)}/>I have read the disclosure and consent to this verification.</label></div>;
}
