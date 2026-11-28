import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export function Step3PanVerification({
  formData,
  onChange,
  panVerified,
  panLoading,
  onVerifyPan,
  panError,
}) {
  const [consentAccepted, setConsentAccepted] = useState(false);

  return (
    <section className="space-y-5" aria-live="polite">
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5">
        <ShieldCheck className="mt-0.5 h-6 w-6 text-blue-700" aria-hidden="true" />
        <div>
          <h3 className="font-semibold text-slate-950">Verify PAN</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Your PAN is verified against the name returned by the completed Aadhaar step.</p>
        </div>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        PAN number
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={10}
          value={formData?.panNumber || ""}
          onChange={(event) => onChange("panNumber", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          disabled={panVerified || panLoading}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono uppercase tracking-wider outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
          aria-describedby={panError ? "pan-verification-error" : undefined}
        />
      </label>

      {!panVerified && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
          <span>I consent to PAN verification for this KYC application.</span>
        </label>
      )}

      <button
        type="button"
        onClick={onVerifyPan}
        disabled={panVerified || panLoading || !consentAccepted}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {panLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : panVerified ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {panLoading ? "Verifying…" : panVerified ? "PAN verified" : "Verify PAN"}
      </button>

      {panError && <p id="pan-verification-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{panError}</p>}
    </section>
  );
}

export default Step3PanVerification;
