import { useState } from "react";
import { CreditCard } from "lucide-react";
import { KycDisclosure, KycUnavailable } from "./KycDisclosure";

export function Step3PanVerification({ enabled, disclosure, formData, onChange, panVerified, panLoading, onVerifyPan, panError }) {
  const [consent, setConsent] = useState(false);
  if (!enabled && !panVerified) return <KycUnavailable title="PAN verification"/>;
  return (
    <section className="pk-verification" aria-live="polite">
      <span className="pk-verification-icon"><CreditCard aria-hidden="true"/></span>
      <h3>{panVerified ? "PAN verified" : "Verify your PAN"}</h3>
      <p>{panVerified ? formData.panMasked || "Verification confirmed by PayTeam." : "Your PAN name must match the verified Aadhaar name."}</p>
      {!panVerified && <>
        <label className="pk-field">PAN number<input type="text" inputMode="text" autoComplete="off" maxLength={10} value={formData.panNumber || ""} onChange={e => onChange("panNumber", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} disabled={panLoading} placeholder="Enter PAN number" aria-describedby={panError ? "pan-verification-error" : undefined}/></label>
        <KycDisclosure text={disclosure} checked={consent} onChange={setConsent} disabled={panLoading}/>
        <button type="button" className="pk-primary" disabled={!consent || panLoading || !/^[A-Z]{5}\d{4}[A-Z]$/.test(formData.panNumber || "")} onClick={onVerifyPan}>{panLoading ? "Verifying…" : "Verify PAN"}</button>
      </>}
      {panError && <p id="pan-verification-error" className="pk-error" role="alert">{panError}</p>}
    </section>
  );
}
export default Step3PanVerification;
