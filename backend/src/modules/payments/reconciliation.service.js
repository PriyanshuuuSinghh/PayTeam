import { invalid } from "./payment.errors.js";

function createReconciliationService(repository) {
  async function listCandidates({ olderThanMinutes = 15, limit = 100 } = {}) {
    if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1 || olderThanMinutes > 1440) throw invalid("Invalid reconciliation age");
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw invalid("Invalid reconciliation limit");
    // Read-only identification boundary. No provider status API or auto-resolution is assumed.
    return repository.findReconciliationCandidates({ olderThanMinutes, limit });
  }
  async function beginAttempt({ requestId, capability }) {
    if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) throw invalid("Invalid reconciliation request ID");
    if (typeof capability !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(capability)) throw invalid("Invalid reconciliation capability");
    return repository.beginReconciliationAttempt({ requestId, capability });
  }
  async function finishAttempt({ attemptId, status, evidenceFingerprint = null, sanitizedResult = null }) {
    if (!/^[1-9]\d*$/.test(String(attemptId))) throw invalid("Invalid reconciliation attempt ID");
    if (!["MATCHED", "UNRESOLVED", "FAILED"].includes(status)) throw invalid("Invalid reconciliation outcome");
    return repository.finishReconciliationAttempt({ attemptId, status, evidenceFingerprint, sanitizedResult });
  }
  return Object.freeze({ listCandidates, beginAttempt, finishAttempt });
}

export { createReconciliationService };
