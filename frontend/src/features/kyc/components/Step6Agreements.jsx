import { useEffect, useState } from "react";
import { getAgreementDetails } from "../../../api/kyc.api";
import { parseApiError } from "../../../utils/errorHandler";
import { KycUnavailable } from "./KycDisclosure";
export function Step6Agreements({ enabled, isStepCompleted, formData, onChange, onNext, isSavingStep }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let cancelled=false;
    getAgreementDetails().then(r=>{if(!cancelled){if(!r?.data?.content || !r.data.agreementCode || !r.data.agreementVersion)throw new Error("Agreement unavailable");setDocument(r.data);onChange("agreementCode",r.data.agreementCode);onChange("agreementVersion",r.data.agreementVersion);onChange("currentAgreementAccepted",Boolean(isStepCompleted && r.data.isAccepted));onChange("agreedTerms",Boolean(isStepCompleted && r.data.isAccepted));}}).catch(err=>{if(!cancelled)setError(parseApiError(err).message || "Agreement unavailable");});
    return ()=>{cancelled=true;};
  }, [enabled,isStepCompleted]);
  const confirmed = Boolean(isStepCompleted && document?.isAccepted);
  if (!enabled) return <KycUnavailable title="Customer agreement"/>;
  return <section className="space-y-4"><header className="pk-section-head"><h3>{document?.title || "Customer agreement"}</h3><p>{document ? `Version ${document.agreementVersion}` : isStepCompleted ? "Acceptance recorded" : "Loading agreement…"}</p></header>
    {error && <p className="pk-error" role="alert">{error}</p>}
    {document && <><div className="pk-panel pk-agreement-text" tabIndex={0}>{document.content}</div>{!confirmed && <label className="pk-consent"><input type="checkbox" checked={Boolean(formData.agreedTerms)} onChange={e=>onChange("agreedTerms",e.target.checked)} disabled={isSavingStep}/>I have read and accept this agreement.</label>}</>}
    <button type="button" className="pk-primary" disabled={isSavingStep || (!document || (!confirmed && !formData.agreedTerms))} onClick={onNext}>{isSavingStep ? "Saving…" : "Continue to review"}</button></section>;
}
export default Step6Agreements;
