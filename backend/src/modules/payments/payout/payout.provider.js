import ApiError from "../../../utils/ApiError.js";
import { notConfigured } from "../payment.errors.js";

const PAYOUT_OUTCOMES = Object.freeze(["PENDING", "SUCCESS", "FAILED", "UNKNOWN"]);

// Provider-specific HTTP details and field mapping are injected only after a
// verified provider contract is supplied. The default adapter is fail-closed.
function createPayoutProvider({ client = null, mapper = null } = {}) {
  function assertConfigured(operation) {
    const names = operation === "createBeneficiary"
      ? ["createBeneficiaryRequest", "createBeneficiaryResponse"]
      : operation === "verifyBeneficiary"
        ? ["verifyBeneficiaryRequest", "verifyBeneficiaryResponse"]
        : operation === "initiatePayout"
          ? ["payoutRequest", "payoutResponse"]
          : operation === "getPayoutStatus"
            ? ["payoutStatusRequest", "payoutStatusResponse"]
            : ["callbackEvent"];
    const clientMethod = operation === "initiatePayout" ? "initiatePayout" : operation;
    if (!client || typeof client[clientMethod] !== "function" || !mapper || names.some((name) => typeof mapper[name] !== "function")) {
      throw notConfigured("Payout");
    }
  }

  async function invoke(operation, command) {
    assertConfigured(operation);
    if (operation === "processCallback") return mapper.callbackEvent(command);
    const mappingNames = {
      createBeneficiary: ["createBeneficiaryRequest", "createBeneficiaryResponse"],
      verifyBeneficiary: ["verifyBeneficiaryRequest", "verifyBeneficiaryResponse"],
      initiatePayout: ["payoutRequest", "payoutResponse"],
      getPayoutStatus: ["payoutStatusRequest", "payoutStatusResponse"],
    }[operation];
    const rawRequest = mapper[mappingNames[0]](command);
    const rawResponse = await client[operation](rawRequest);
    const normalized = mapper[mappingNames[1]](rawResponse);
    return operation === "initiatePayout" || operation === "getPayoutStatus"
      ? normalizePayoutOutcome(normalized)
      : normalized;
  }

  return Object.freeze({
    assertConfigured,
    createBeneficiary: (command) => invoke("createBeneficiary", command),
    verifyBeneficiary: (command) => invoke("verifyBeneficiary", command),
    initiatePayout: (command) => invoke("initiatePayout", command),
    getPayoutStatus: (command) => invoke("getPayoutStatus", command),
    processCallback: (event) => invoke("processCallback", event),
  });
}

function normalizePayoutOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !PAYOUT_OUTCOMES.includes(value.status)) {
    throw new ApiError(502, "Payout provider adapter returned an invalid normalized outcome", [], "PROVIDER_ADAPTER_INVALID");
  }
  return { status: value.status, providerReference: typeof value.providerReference === "string" ? value.providerReference : null };
}

export { PAYOUT_OUTCOMES, createPayoutProvider, normalizePayoutOutcome };
