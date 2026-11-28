import { Building2 } from "lucide-react";
import { KycDisclosure, KycUnavailable } from "./KycDisclosure";
export function Step4BankDetails({ enabled, disclosure, formData, onChange, isVerified, busy }) {
  if (!enabled && !isVerified) return <KycUnavailable title="Bank verification"/>;
  return <section className="pk-verification"><span className="pk-verification-icon"><Building2/></span><h3>{isVerified ? "Bank details verified" : "Verify your bank account"}</h3><p>{isVerified ? `${formData.bankName || "Bank account"} · ${formData.accountNumber || "Number hidden"}` : "Enter the account number and IFSC for account verification."}</p>
    {!isVerified && <><div className="pk-fields"><label className="pk-field">Account number<input inputMode="numeric" autoComplete="off" maxLength={18} value={formData.accountNumber} onChange={e => onChange("accountNumber", e.target.value.replace(/\D/g,""))} disabled={busy}/></label><label className="pk-field">Confirm account number<input inputMode="numeric" autoComplete="off" maxLength={18} value={formData.confirmAccountNumber} onChange={e => onChange("confirmAccountNumber", e.target.value.replace(/\D/g,""))} disabled={busy}/></label><label className="pk-field">IFSC code<input autoComplete="off" maxLength={11} value={formData.ifscCode} onChange={e => onChange("ifscCode", e.target.value.toUpperCase())} disabled={busy}/></label></div><KycDisclosure text={disclosure} checked={formData.bankConsent} onChange={v => onChange("bankConsent",v)} disabled={busy}/></>}
  </section>;
}
export default Step4BankDetails;
