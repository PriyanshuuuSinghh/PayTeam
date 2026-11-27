import { randomUUID } from "node:crypto";
import ApiError from "../../../utils/ApiError.js";
import { parsePaise } from "../money.js";
import { conflict, invalid, unavailable } from "../payment.errors.js";
import { assertIdempotencyPayloadMatches, createIdempotencyScope, hashIdempotencyPayload, validateIdempotencyKey } from "../paymentIdempotency.js";

const PAYOUT_OPERATION = "PAYOUT";
const PAYOUT_STATES = Object.freeze(["PENDING", "SUCCESS", "FAILED", "UNKNOWN"]);

function createPayoutService({ repository, provider, requestId = randomUUID }) {
  async function listBeneficiaries(userId) {
    requireUser(userId);
    return repository.listBeneficiaries({ userId });
  }

  async function createBeneficiary({ userId, details }) {
    requireUser(userId);
    if (!details || typeof details !== "object" || Array.isArray(details)) throw invalid("Beneficiary details must be an object");
    provider.assertConfigured("createBeneficiary");
    const normalized = await provider.createBeneficiary({ userId, details });
    return repository.createBeneficiary({ userId, normalized });
  }

  async function verifyBeneficiary({ userId, beneficiaryId }) {
    requireUser(userId);
    const beneficiary = await repository.findBeneficiaryForUser({ userId, beneficiaryId: validateIdentifier(beneficiaryId, "beneficiary ID") });
    if (!beneficiary) throw new ApiError(404, "Beneficiary not found", [], "NOT_FOUND");
    provider.assertConfigured("verifyBeneficiary");
    const result = await provider.verifyBeneficiary({ userId, beneficiary });
    return repository.recordBeneficiaryVerification({ userId, beneficiaryId: beneficiary.id, normalizedResult: result });
  }

  async function createPayout({ userId, beneficiaryId, amount, idempotencyKey }) {
    requireUser(userId);
    validateIdempotencyKey(idempotencyKey);
    const amountPaise = parsePaise(amount);
    const beneficiaryReference = validateIdentifier(beneficiaryId, "beneficiary ID");
    const payloadHash = hashIdempotencyPayload({ operation: PAYOUT_OPERATION, beneficiaryId: beneficiaryReference, amountPaise: amountPaise.toString() });
    const scope = createIdempotencyScope(userId, PAYOUT_OPERATION, idempotencyKey);
    const existing = await repository.findIdempotentPayout(scope);
    if (existing) return replay(existing, payloadHash);

    provider.assertConfigured("initiatePayout");
    const beneficiary = await repository.findBeneficiaryForUser({ userId, beneficiaryId: beneficiaryReference });
    if (!beneficiary) throw new ApiError(404, "Beneficiary not found", [], "NOT_FOUND");
    // The repository must apply the team-approved beneficiary eligibility policy;
    // the policy is intentionally not inferred here.
    await repository.assertPayoutBeneficiaryEligible({ userId, beneficiary });

    const initial = {
      request_id: requestId(),
      operation: PAYOUT_OPERATION,
      idempotency_key: idempotencyKey,
      idempotency_payload_hash: payloadHash,
      user_id: userId,
      initiator_user_id: userId,
      beneficiary_id: beneficiary.id,
      amount_paise: amountPaise.toString(),
      currency: "INR",
      status: "PENDING",
      provider_status: "NOT_CONFIGURED",
      created_at: new Date(),
    };
    const creation = await repository.persistPayout(initial);
    if (!creation || typeof creation.created !== "boolean" || !creation.transaction) throw unavailable("Payout repository did not confirm idempotent creation");
    if (!creation.created) return replay(creation.transaction, payloadHash);
    if (creation.transaction.idempotency_payload_hash !== payloadHash) throw conflict("Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");

    let outcome;
    try {
      outcome = await provider.initiatePayout({ payout: creation.transaction, beneficiary });
    } catch {
      await repository.updatePayout(creation.transaction.request_id, { status: "UNKNOWN", reconciliation_required: true });
      throw unavailable("Payout outcome is uncertain; do not retry automatically");
    }
    if (!PAYOUT_STATES.includes(outcome.status)) throw unavailable("Payout adapter returned an unsupported internal state");
    const updated = await repository.updatePayout(creation.transaction.request_id, { status: outcome.status, provider_reference: outcome.providerReference });
    return safePayout(updated || { ...creation.transaction, status: outcome.status, provider_reference: outcome.providerReference });
  }

  async function getPayout({ userId, payoutId }) {
    requireUser(userId);
    const payout = await repository.findPayoutForUser({ userId, payoutId: validateIdentifier(payoutId, "payout ID") });
    if (!payout) throw new ApiError(404, "Payout not found", [], "NOT_FOUND");
    return safePayout(payout);
  }

  return Object.freeze({ listBeneficiaries, createBeneficiary, verifyBeneficiary, createPayout, getPayout });
}

function replay(transaction, expectedHash) {
  assertIdempotencyPayloadMatches(transaction, expectedHash);
  return safePayout(transaction, true);
}

function safePayout(transaction, replayed = false) {
  if (!transaction || !PAYOUT_STATES.includes(transaction.status)) throw unavailable("Payout record is incomplete or invalid");
  return {
    payoutId: transaction.id,
    request_id: transaction.request_id,
    amount: formatRupees(transaction.amount_paise),
    currency: transaction.currency,
    status: transaction.status,
    reconciliation_required: Boolean(transaction.reconciliation_required || transaction.status === "UNKNOWN"),
    replayed,
  };
}

function formatRupees(value) {
  if (!/^\d+$/.test(String(value))) throw unavailable("Payout amount record is invalid");
  const paise = BigInt(value);
  return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
}

function validateIdentifier(value, field) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^[A-Za-z0-9_-]{1,128}$/.test(String(value))) throw invalid(`Invalid ${field}`);
  return String(value);
}

function requireUser(userId) { if (!userId) throw invalid("Authentication required", "UNAUTHORIZED"); }

export { PAYOUT_OPERATION, PAYOUT_STATES, createPayoutService };
