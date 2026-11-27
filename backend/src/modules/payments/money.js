import { invalid } from "./payment.errors.js";

function parsePaise(value, field = "amount") {
  if (typeof value !== "string") throw invalid(`${field} must be a decimal string`);
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) throw invalid(`Invalid ${field}`);
  const [rupees, fraction = ""] = raw.split(".");
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (paise <= 0n) throw invalid(`${field} must be greater than zero`);
  return paise;
}

function parseFlatPaise(value) {
  if (typeof value !== "string") throw invalid("Flat charge must be a decimal string");
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) throw invalid("Invalid flat charge");
  const [rupees, fraction = ""] = raw.split(".");
  return BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function percentToBasisPoints(value) {
  if (typeof value !== "string") throw invalid("Percentage rate must be a decimal string");
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(raw)) throw invalid("Invalid percentage rate");
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function calculateConfiguredAmount(amountPaise, config) {
  if (!config || !["percentage", "flat"].includes(config.type)) throw invalid("Missing or invalid rate configuration", "RATE_CONFIGURATION_INVALID");
  if (config.type === "flat") return parseFlatPaise(config.value);
  const basisPoints = percentToBasisPoints(config.value);
  const numerator = amountPaise * basisPoints;
  if (numerator % 10000n !== 0n) {
    throw invalid("Rate result requires an approved rounding policy", "ROUNDING_POLICY_UNRESOLVED");
  }
  return numerator / 10000n;
}

function calculateOperatorCharges({ amount, serviceCharge, instantCharge = null, commissions = [] }) {
  const amountPaise = parsePaise(amount);
  const servicePaise = calculateConfiguredAmount(amountPaise, serviceCharge);
  const instantPaise = instantCharge == null ? 0n : calculateConfiguredAmount(amountPaise, instantCharge);
  const commissionBreakdown = commissions.map(({ userId, hierarchyLevel, type, value }) => ({
    userId,
    hierarchyLevel,
    amountPaise: calculateConfiguredAmount(amountPaise, { type, value }).toString(),
  }));
  return {
    amountPaise: amountPaise.toString(),
    serviceChargePaise: servicePaise.toString(),
    instantChargePaise: instantPaise.toString(),
    totalInitiatorChargePaise: (servicePaise + instantPaise).toString(),
    settlementMode: instantCharge == null ? "T_PLUS_1" : "INSTANT",
    commissions: commissionBreakdown,
  };
}

export { parsePaise, calculateConfiguredAmount, calculateOperatorCharges };
