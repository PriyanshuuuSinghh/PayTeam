import ApiError from "../../utils/ApiError.js";
import { invalid } from "./payment.errors.js";

function createPaymentStatusService(repository) {
  async function getStatus(userId, requestId) {
    if (!userId) throw invalid("Authentication required", "UNAUTHORIZED");
    if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) throw invalid("Invalid request ID");
    const transaction = await repository.findTransactionForUser(userId, requestId);
    if (!transaction) throw new ApiError(404, "Payment transaction not found", [], "NOT_FOUND");
    // Explicit projection avoids exposing provider payloads, PII, and credentials.
    return {
      transactionId: transaction.id,
      request_id: transaction.request_id,
      gateway: transaction.gateway,
      amount: formatAmount(transaction.amount_paise),
      currency: transaction.currency,
      status: transaction.status,
      initiation_status_code: transaction.initiation_status_code,
      settlement_status: transaction.settlement_status,
      intended_settlement_mode: transaction.intended_settlement_mode,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
    };
  }
  return Object.freeze({ getStatus });
}

function formatAmount(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const paise = BigInt(value);
  return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
}

export { createPaymentStatusService };
