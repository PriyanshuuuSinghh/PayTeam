export function Step3PanVerification() {
  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <h3 className="font-semibold">PAN consent pending approval</h3>
      <p className="mt-1">
        PayTeam&apos;s PAN verification consent and customer disclosures have
        not been approved yet. PAN verification is unavailable until they are
        configured.
      </p>
    </section>
  );
}

export default Step3PanVerification;
