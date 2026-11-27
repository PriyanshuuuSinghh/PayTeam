export function Step6Agreements() {
  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <h3 className="font-semibold">Agreement pending approval</h3>
      <p className="mt-1">
        PayTeam&apos;s agreement terms have not been approved yet. This KYC step
        is unavailable until the approved agreement is configured.
      </p>
    </section>
  );
}

export default Step6Agreements;
