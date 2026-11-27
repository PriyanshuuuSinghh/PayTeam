import { invalid } from "./payment.errors.js";

const PAYMENT_STATES = Object.freeze(["PENDING", "UNKNOWN", "SUCCESS", "FAILED"]);
const SETTLEMENT_STATES = Object.freeze(["UNCONFIRMED", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"]);

function transitionPaymentStatus(current, incoming) {
  if (!PAYMENT_STATES.includes(current) || !PAYMENT_STATES.includes(incoming)) throw invalid("Invalid payment state", "PAYMENT_STATE_INVALID");
  if (current === incoming) return current;
  if (["SUCCESS", "FAILED"].includes(current)) return current;
  if (incoming === "UNKNOWN") return current;
  if (current === "UNKNOWN") return incoming;
  return incoming;
}

function normalizeCallbackStatus(status) {
  if (status === "SUCCESS") return "SUCCESS";
  if (status === "FAILED") return "FAILED";
  if (status === "PENDING") return "PENDING";
  throw invalid("Unsupported callback status", "PAYMENT_CALLBACK_INVALID");
}

export { PAYMENT_STATES, SETTLEMENT_STATES, transitionPaymentStatus, normalizeCallbackStatus };
