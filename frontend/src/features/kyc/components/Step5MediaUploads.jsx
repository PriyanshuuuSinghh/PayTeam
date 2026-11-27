export function Step5MediaUploads() {
  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <h3 className="font-semibold">KYC media consent pending approval</h3>
      <p className="mt-1">
        PayTeam&apos;s media purposes, customer disclosures, and retention rules
        have not been approved yet. KYC media collection is unavailable until
        they are configured.
      </p>
    </section>
  );
}

export default Step5MediaUploads;
