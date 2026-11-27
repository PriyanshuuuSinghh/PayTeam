import { unavailable } from "./payment.errors.js";

/*
 * Explicit unavailable adapter used only by tests/offline deployments. Runtime
 * routers use mysqlPayment.repository.js and the approved payment schema files.
 *
 * Scheme reads must resolve the authenticated user's explicit assignment or the
 * approved default, and scope configurations to that scheme/service/operator.
 * User-facing configuration reads must omit hierarchy commission rates. Writes
 * must authorize target assignment and atomically maintain exactly one default.
 *
 * findIdempotentInitiation({ userId, operation, idempotencyKey }) returns the stored
 * transaction or null. persistInitiation(transaction) must atomically enforce unique
 * (userId, operation, idempotencyKey) and unique request_id, compare payload_hash,
 * and return { created: true, transaction } only to the winning request. A competing
 * identical request returns { created: false, transaction }; a different payload
 * must raise IDEMPOTENCY_KEY_REUSED. This database uniqueness/locking is mandatory.
 *
 * Callback processing must lock the payment transaction, correlate request/order/
 * original amount, insert a unique protected event, and apply the state transition in
 * one transaction. Settlement and financial posting must be atomic and idempotent.
 * Eligible ancestors must be resolved from the user's `parent_id` chain and validated
 * against `role_hierarchy`; the repository must return the complete, policy-eligible
 * set or fail closed. Existing role-descendant queries do not implement this inverse
 * ancestor/commission-eligibility contract.
 *
 * Payout and bill repositories must scope records to userId, enforce idempotency and
 * link each bill payment to an owned enquiry snapshot. They must never return success
 * without durable provider-confirmed state. Wallet/ledger/commission posting must use
 * stable unique references and commit atomically with settlement state.
 */
function unavailableRepository() {
  const fail = async () => { throw unavailable(); };
  return Object.freeze({
    listAvailableSchemesForUser: fail,
    listAllSchemes: fail,
    createScheme: fail,
    renameScheme: fail,
    setDefaultScheme: fail,
    assignScheme: fail,
    findAssignedScheme: fail,
    findSafeConfigurationForUser: fail,
    findApplicableConfiguration: fail,
    setApplicableConfiguration: fail,
    findIdempotentInitiation: fail,
    persistInitiation: fail,
    findTransactionForUser: fail,
    updateInitiation: fail,
    processCallbackAtomically: fail,
    recordRejectedCallback: fail,
    findReconciliationCandidates: fail,
    beginReconciliationAttempt: fail,
    finishReconciliationAttempt: fail,
    listEligibleAncestors: fail,
    updateSettlement: fail,
    postWalletLedgerCommissionsAtomically: fail,
    listBeneficiaries: fail,
    findBeneficiaryForUser: fail,
    assertPayoutBeneficiaryEligible: fail,
    recordBeneficiaryVerification: fail,
    verifyBeneficiary: fail,
    createBeneficiary: fail,
    findIdempotentPayout: fail,
    findPayoutBeneficiary: fail,
    persistPayout: fail,
    updatePayout: fail,
    createPayout: fail,
    findPayoutForUser: fail,
    findPayout: fail,
    findIdempotentBillEnquiry: fail,
    persistBillEnquiry: fail,
    updateBillEnquiry: fail,
    findBillEnquiryForUser: fail,
    createBillEnquiry: fail,
    findBillEnquiry: fail,
    findIdempotentBillPayment: fail,
    persistBillPayment: fail,
    createBillPayment: fail,
    updateBillPayment: fail,
    findBillPaymentForUser: fail,
  });
}

export { unavailableRepository };
export default unavailableRepository;
