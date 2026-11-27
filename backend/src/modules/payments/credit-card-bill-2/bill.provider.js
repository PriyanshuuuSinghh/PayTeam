import ApiError from "../../../utils/ApiError.js";
import { notConfigured } from "../payment.errors.js";

const BILL_PAYMENT_OUTCOMES = Object.freeze(["PENDING", "SUCCESS", "FAILED", "UNKNOWN"]);

// No provider URL, HTTP method, credentials, or payload is selected here.
// A future adapter supplies a client and explicit request/response mapper.
function createCreditCardBillProvider({ client = null, mapper = null } = {}) {
  function assertConfigured(operation) {
    const mappingNames = operation === "enquireBill"
      ? ["enquiryRequest", "enquiryResponse"]
      : operation === "initiateBillPayment"
        ? ["paymentRequest", "paymentResponse"]
        : operation === "getBillPaymentStatus"
          ? ["paymentStatusRequest", "paymentStatusResponse"]
          : ["callbackEvent"];
    if (!client || typeof client[operation] !== "function" || !mapper || mappingNames.some((name) => typeof mapper[name] !== "function")) {
      throw notConfigured("Credit card bill");
    }
  }

  async function invoke(operation, command) {
    assertConfigured(operation);
    if (operation === "processCallback") return mapper.callbackEvent(command);
    const mappingNames = {
      enquireBill: ["enquiryRequest", "enquiryResponse"],
      initiateBillPayment: ["paymentRequest", "paymentResponse"],
      getBillPaymentStatus: ["paymentStatusRequest", "paymentStatusResponse"],
    }[operation];
    const rawRequest = mapper[mappingNames[0]](command);
    const rawResponse = await client[operation](rawRequest);
    const normalized = mapper[mappingNames[1]](rawResponse);
    return operation === "initiateBillPayment" || operation === "getBillPaymentStatus"
      ? normalizeBillPaymentOutcome(normalized)
      : normalized;
  }

  return Object.freeze({
    assertConfigured,
    enquireBill: (command) => invoke("enquireBill", command),
    initiateBillPayment: (command) => invoke("initiateBillPayment", command),
    getBillPaymentStatus: (command) => invoke("getBillPaymentStatus", command),
    processCallback: (event) => invoke("processCallback", event),
  });
}

function normalizeBillPaymentOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !BILL_PAYMENT_OUTCOMES.includes(value.status)) {
    throw new ApiError(502, "Bill provider adapter returned an invalid normalized outcome", [], "PROVIDER_ADAPTER_INVALID");
  }
  return { status: value.status, providerReference: typeof value.providerReference === "string" ? value.providerReference : null };
}

export { BILL_PAYMENT_OUTCOMES, createCreditCardBillProvider, normalizeBillPaymentOutcome };
