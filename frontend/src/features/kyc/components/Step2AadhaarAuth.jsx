export function Step2AadhaarAuth() {
  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <h3 className="font-semibold">Aadhaar consent pending approval</h3>
      <p className="mt-1">
        PayTeam&apos;s identity verification consent and customer disclosures
        have not been approved yet. Aadhaar verification is unavailable until
        they are configured.
      </p>
    </section>
  );
}

export default Step2AadhaarAuth;
