import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

export function Step2AadhaarAuth({
  onTriggerOtp,
  isInitiating,
  digilockerSessionActive,
  onCheckStatus,
  isCheckingStatus,
  aadhaarVerified,
  verifiedData,
  sessionStatus,
  errorMessage,
  onResetSession,
}) {
  const [consentAccepted, setConsentAccepted] = useState(false);

  if (aadhaarVerified) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-emerald-950">Aadhaar verified</h3>
            <p className="mt-1 text-sm text-emerald-800">
              {verifiedData?.verifiedName || "Verified identity"}
              {verifiedData?.maskedIdentifier && verifiedData.maskedIdentifier !== "—"
                ? ` · ${verifiedData.maskedIdentifier}`
                : ""}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 text-blue-700" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-slate-950">Verify with DigiLocker</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Continue to the IDTO-hosted DigiLocker flow. PayTeam receives the verified result through its secure callback; do not share an OTP with PayTeam staff.
            </p>
          </div>
        </div>
      </div>

      {!digilockerSessionActive ? (
        <>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
            />
            <span>I consent to DigiLocker identity verification for this KYC application.</span>
          </label>
          <button
            type="button"
            onClick={onTriggerOtp}
            disabled={!consentAccepted || isInitiating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isInitiating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {isInitiating ? "Starting verification…" : "Continue to DigiLocker"}
          </button>
        </>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-700">
            Verification is {sessionStatus === "processing" ? "being processed" : "awaiting completion"}. Complete the provider flow, then check the authoritative status.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onCheckStatus}
              disabled={isCheckingStatus}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isCheckingStatus ? "animate-spin" : ""}`} />
              Check verification status
            </button>
            {(["failed", "expired"].includes(sessionStatus)) && (
              <button type="button" onClick={onResetSession} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700">
                Start again
              </button>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

export default Step2AadhaarAuth;
