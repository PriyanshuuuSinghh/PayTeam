import { createHash } from "node:crypto";
import { parsePaise } from "./money.js";
import { normalizeCallbackStatus, transitionPaymentStatus } from "./paymentState.js";
import { unavailable, invalid } from "./payment.errors.js";

function createCallbackService({ repository, authenticateCallback = null }) {
  async function processNixasoftEvent(event) {
    if (!event || typeof event.requestId !== "string" || !event.requestId.trim() || event.requestId.length > 128 || typeof event.orderId !== "string" || !event.orderId.trim() || event.orderId.length > 255) throw invalid("Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
    if (typeof authenticateCallback !== "function") throw unavailable("Provider callback authentication is not configured");
    const authenticated = await authenticateCallback(event);
    if (!authenticated) {
      const safeEvent = sanitizeEventForPersistence(event);
      const fingerprint = fingerprintEvent({ ...safeEvent, authentication: "rejected" });
      await repository.recordRejectedCallback({ gateway: "PREMIUM_PG_3", fingerprint, payload: safeEvent, authenticationVerified: false, processingStatus: "REJECTED_AUTH" });
      throw invalid("Provider callback authentication failed", "PAYMENT_CALLBACK_UNAUTHENTICATED");
    }
    const amountPaise = parsePaise(String(event.amount)).toString();
    const requestedStatus = normalizeCallbackStatus(event.status);
    validateOptionalCallbackFields(event);
    const safeEvent = sanitizeEventForPersistence(event);
    const fingerprint = fingerprintEvent(safeEvent);
    // The repository must lock/correlate the transaction and atomically insert the
    // event and apply its monotonic transition. Payloads may contain PII: never log.
    const result = await repository.processCallbackAtomically({
      gateway: "PREMIUM_PG_3",
      requestId: event.requestId,
      gatewayOrderId: event.orderId,
      amountPaise,
      incomingStatus: requestedStatus,
      transitionStatus: (currentStatus) => transitionPaymentStatus(currentStatus, requestedStatus),
      event: { fingerprint, payload: safeEvent, authenticationVerified: true, processingStatus: "PROCESSED" },
    });
    return { duplicate: Boolean(result.duplicate), status: result.status, settlement_status: result.settlement_status };
  }
  return Object.freeze({ processNixasoftEvent });
}

function fingerprintEvent(event) {
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
}

function sanitizeEventForPersistence(event) {
  const allowed = ["status", "requestId", "orderId", "amount", "charges", "settlement_amount", "utr", "payment_mode"];
  return Object.fromEntries(allowed.filter((key) => event[key] !== undefined).map((key) => [key, event[key]]));
}

const OPTIONAL_TEXT_FIELDS = ["utr", "payment_mode", "network", "subtype", "beneficiaryName", "emailId", "mobileNumber", "bank_name", "product_name", "description"];
function validateOptionalCallbackFields(event) {
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (event[field] !== undefined && (typeof event[field] !== "string" || event[field].length > 500)) throw invalid("Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
  }
  for (const field of ["charges", "settlement_amount"]) {
    if (event[field] !== undefined) parseNonNegativeAmount(event[field], field);
  }
  if (event.card_last4 !== undefined && (typeof event.card_last4 !== "string" || !/^\d{4}$/.test(event.card_last4))) throw invalid("Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
  if (event.emailId !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.emailId)) throw invalid("Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
  if (event.mobileNumber !== undefined && !/^\+?[0-9 -]{10,16}$/.test(event.mobileNumber)) throw invalid("Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
}

function parseNonNegativeAmount(value, field) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value))) throw invalid(`Invalid callback ${field}`, "PAYMENT_CALLBACK_INVALID");
}

export { createCallbackService, sanitizeEventForPersistence };
