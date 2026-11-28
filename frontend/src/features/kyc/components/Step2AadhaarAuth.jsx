import { useState } from "react";
import { ShieldCheck, ArrowUpRight, RefreshCw } from "lucide-react";
import { KycDisclosure, KycUnavailable } from "./KycDisclosure";
export function Step2AadhaarAuth({ enabled, disclosure, onTriggerOtp, isInitiating, authorizationUrl, digilockerSessionActive, onCheckStatus, isCheckingStatus, aadhaarVerified, verifiedData, sessionStatus, errorMessage }) {
  const [consent, setConsent] = useState(false);
  if (!enabled && !aadhaarVerified) return <KycUnavailable title="Aadhaar verification"/>;
  const active = digilockerSessionActive && !["failed", "expired"].includes(sessionStatus);
  return <section className="pk-verification"><span className="pk-verification-icon"><ShieldCheck/></span><h3>{aadhaarVerified ? "Aadhaar verified" : "Verify your Aadhaar"}</h3><p>{aadhaarVerified ? verifiedData?.maskedIdentifier || "Verification confirmed by PayTeam." : "Complete authorization on the DigiLocker portal. Enter your Aadhaar details only on the authorized portal."}</p>
    {!aadhaarVerified && <><KycDisclosure text={disclosure} checked={consent} onChange={setConsent} disabled={isInitiating || active}/>
    {!active && <button type="button" className="pk-primary" disabled={!consent || isInitiating} onClick={onTriggerOtp}>{isInitiating ? "Connecting…" : "Start DigiLocker verification"}<ArrowUpRight size={17}/></button>}
    {authorizationUrl && active && <a className="pk-primary" href={authorizationUrl} target="_blank" rel="noopener noreferrer">Open DigiLocker <ArrowUpRight size={18}/></a>}
    {active && <button type="button" className="pk-secondary" disabled={isCheckingStatus || isInitiating} onClick={onCheckStatus}><RefreshCw size={16}/>{isCheckingStatus ? "Checking…" : "Check verification status"}</button>}</>}
    {errorMessage && <p className="pk-error" role="alert">{errorMessage}</p>}
  </section>;
}
export default Step2AadhaarAuth;
