export const count = new Intl.NumberFormat("en-IN");

export function formatMoney(amount) {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(amount ?? "");
  if (!match) return null;
  const [, sign, whole, fraction] = match;
  return `${sign}₹${count.format(BigInt(whole))}.${fraction}`;
}

export function metricState(result) {
  if (result?.failed) return "Could not refresh";
  return result?.loading ? "Loading…" : "Unavailable";
}
