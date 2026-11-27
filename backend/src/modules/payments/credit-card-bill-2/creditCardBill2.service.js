import { randomUUID } from "node:crypto";
import ApiError from "../../../utils/ApiError.js";
import { conflict, invalid, unavailable } from "../payment.errors.js";
import { assertIdempotencyPayloadMatches, createIdempotencyScope, hashIdempotencyPayload, validateIdempotencyKey } from "../paymentIdempotency.js";

const BILL_ENQUIRY_OPERATION = "CREDIT_CARD_BILL_2_ENQUIRY";
const BILL_PAYMENT_OPERATION = "CREDIT_CARD_BILL_2_PAYMENT";
const BILL_PAYMENT_STATES = Object.freeze(["PENDING", "SUCCESS", "FAILED", "UNKNOWN"]);

function createCreditCardBill2Service({ repository, provider, requestId = randomUUID }) {
  async function createEnquiry({ userId, customerReference, idempotencyKey }) {
    requireUser(userId);
    validateIdempotencyKey(idempotencyKey);
    if (typeof customerReference !== "string" || !customerReference.trim() || customerReference.length > 512) throw invalid("Customer reference is required");
    const normalizedReference = customerReference.trim();
    const hash = hashIdempotencyPayload({ operation: BILL_ENQUIRY_OPERATION, customerReference: normalizedReference });
    const scope = createIdempotencyScope(userId, BILL_ENQUIRY_OPERATION, idempotencyKey);
    const existing = await repository.findIdempotentBillEnquiry(scope);
    if (existing) return replayEnquiry(existing, hash);

    provider.assertConfigured("enquireBill");
    const initial = {
      request_id: requestId(), operation: BILL_ENQUIRY_OPERATION, idempotency_key: idempotencyKey,
      idempotency_payload_hash: hash, user_id: userId,
      customer_reference_hash: hashIdempotencyPayload({ customerReference: normalizedReference }),
      status: "PENDING", created_at: new Date(),
    };
    const creation = await repository.persistBillEnquiry(initial);
    if (!creation || typeof creation.created !== "boolean" || !creation.enquiry) throw unavailable("Bill enquiry repository did not confirm idempotent creation");
    if (!creation.created) return replayEnquiry(creation.enquiry, hash);
    if (creation.enquiry.idempotency_payload_hash !== hash) throw conflict("Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");

    try {
      const snapshot = await provider.enquireBill({ customerReference: normalizedReference, enquiryId: creation.enquiry.id, userId });
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw unavailable("Bill provider adapter returned an invalid enquiry snapshot");
      const updated = await repository.updateBillEnquiry(creation.enquiry.request_id, { status: "COMPLETED", snapshot });
      return safeEnquiry(updated || { ...creation.enquiry, status: "COMPLETED", snapshot }, false);
    } catch {
      await repository.updateBillEnquiry(creation.enquiry.request_id, { status: "UNKNOWN", reconciliation_required: true });
      throw unavailable("Bill enquiry outcome is unavailable or uncertain");
    }
  }

  async function getEnquiry({ userId, enquiryId }) {
    requireUser(userId);
    const enquiry = await repository.findBillEnquiryForUser({ userId, enquiryId: validateIdentifier(enquiryId) });
    if (!enquiry) throw new ApiError(404, "Bill enquiry not found", [], "NOT_FOUND");
    return safeEnquiry(enquiry, false);
  }

  async function createPayment({ userId, enquiryId, idempotencyKey }) {
    requireUser(userId);
    validateIdempotencyKey(idempotencyKey);
    const id = validateIdentifier(enquiryId);
    const hash = hashIdempotencyPayload({ operation: BILL_PAYMENT_OPERATION, enquiryId: id });
    const scope = createIdempotencyScope(userId, BILL_PAYMENT_OPERATION, idempotencyKey);
    const existing = await repository.findIdempotentBillPayment(scope);
    if (existing) return replayBillPayment(existing, hash);

    provider.assertConfigured("initiateBillPayment");
    const enquiry = await repository.findBillEnquiryForUser({ userId, enquiryId: id });
    if (!enquiry) throw new ApiError(404, "Bill enquiry not found", [], "NOT_FOUND");
    if (enquiry.status !== "COMPLETED" || !enquiry.snapshot) throw invalid("Bill enquiry is not ready for payment", "BILL_ENQUIRY_NOT_READY");
    const initial = {
      request_id: requestId(), operation: BILL_PAYMENT_OPERATION, idempotency_key: idempotencyKey,
      idempotency_payload_hash: hash, user_id: userId, enquiry_id: enquiry.id,
      status: "PENDING", created_at: new Date(),
    };
    const creation = await repository.persistBillPayment(initial);
    if (!creation || typeof creation.created !== "boolean" || !creation.payment) throw unavailable("Bill payment repository did not confirm idempotent creation");
    if (!creation.created) return replayBillPayment(creation.payment, hash);
    if (creation.payment.idempotency_payload_hash !== hash) throw conflict("Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");

    try {
      const outcome = await provider.initiateBillPayment({ payment: creation.payment, enquirySnapshot: enquiry.snapshot, userId });
      if (!outcome || !BILL_PAYMENT_STATES.includes(outcome.status)) throw unavailable("Bill provider adapter returned an invalid normalized outcome");
      const updated = await repository.updateBillPayment(creation.payment.request_id, { status: outcome.status, provider_reference: outcome.providerReference || null });
      return safeBillPayment(updated || { ...creation.payment, status: outcome.status }, false);
    } catch {
      await repository.updateBillPayment(creation.payment.request_id, { status: "UNKNOWN", reconciliation_required: true });
      throw unavailable("Bill payment outcome is uncertain; do not retry automatically");
    }
  }

  async function getPayment({ userId, paymentId }) {
    requireUser(userId);
    const payment = await repository.findBillPaymentForUser({ userId, paymentId: validateIdentifier(paymentId) });
    if (!payment) throw new ApiError(404, "Bill payment not found", [], "NOT_FOUND");
    return safeBillPayment(payment, false);
  }

  return Object.freeze({ createEnquiry, getEnquiry, createPayment, getPayment });
}

function replayEnquiry(enquiry, expectedHash) {
  assertIdempotencyPayloadMatches(enquiry, expectedHash);
  return safeEnquiry(enquiry, true);
}

function replayBillPayment(payment, expectedHash) {
  assertIdempotencyPayloadMatches(payment, expectedHash);
  return safeBillPayment(payment, true);
}

function safeEnquiry(enquiry, replayed) {
  if (!enquiry || !["PENDING", "COMPLETED", "UNKNOWN", "FAILED"].includes(enquiry.status)) throw unavailable("Bill enquiry record is invalid");
  return { enquiryId: enquiry.id, request_id: enquiry.request_id, status: enquiry.status, snapshot: enquiry.status === "COMPLETED" ? enquiry.snapshot : null, reconciliation_required: Boolean(enquiry.reconciliation_required || enquiry.status === "UNKNOWN"), replayed };
}

function safeBillPayment(payment, replayed) {
  if (!payment || !BILL_PAYMENT_STATES.includes(payment.status)) throw unavailable("Bill payment record is invalid");
  return { paymentId: payment.id, request_id: payment.request_id, status: payment.status, reconciliation_required: Boolean(payment.reconciliation_required || payment.status === "UNKNOWN"), replayed };
}

function validateIdentifier(value) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^[A-Za-z0-9_-]{1,128}$/.test(String(value))) throw invalid("Invalid enquiry or payment ID");
  return String(value);
}

function requireUser(userId) { if (!userId) throw invalid("Authentication required", "UNAUTHORIZED"); }

export { BILL_ENQUIRY_OPERATION, BILL_PAYMENT_OPERATION, BILL_PAYMENT_STATES, createCreditCardBill2Service };
