import { createHash } from "node:crypto";
import { conflict, invalid } from "./payment.errors.js";

function validateIdempotencyKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw invalid("A valid Idempotency-Key header is required", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return value;
}

function createIdempotencyScope(userId, operation, idempotencyKey) {
  if (!userId || typeof operation !== "string" || !operation) throw invalid("Invalid idempotency scope", "IDEMPOTENCY_SCOPE_INVALID");
  return { userId, operation, idempotencyKey: validateIdempotencyKey(idempotencyKey) };
}

function hashIdempotencyPayload(payload) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function assertIdempotencyPayloadMatches(transaction, expectedHash) {
  if (!transaction || transaction.idempotency_payload_hash !== expectedHash) {
    throw conflict("Idempotency-Key was already used with a different request", "IDEMPOTENCY_KEY_REUSED");
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export { validateIdempotencyKey, createIdempotencyScope, hashIdempotencyPayload, assertIdempotencyPayloadMatches };
