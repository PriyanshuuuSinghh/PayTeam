export function Step4BankDetails() {
  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <h3 className="font-semibold">Bank verification pending approval</h3>
      <p className="mt-1">
        PayTeam&apos;s bank verification provider permissions and customer
        disclosures have not been approved yet. Bank verification is
        unavailable until they are configured.
      </p>
    </section>
  );
}

export default Step4BankDetails;
