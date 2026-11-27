import { randomUUID } from "node:crypto";
import ApiError from "../../utils/ApiError.js";
import { isValidEmail, isValidMobile, normalizeEmail, normalizeMobile } from "../../utils/validationHelper.js";
import { invalid, unavailable } from "./payment.errors.js";
import { calculateOperatorCharges, parsePaise } from "./money.js";
import { assertIdempotencyPayloadMatches, createIdempotencyScope, hashIdempotencyPayload, validateIdempotencyKey } from "./paymentIdempotency.js";
import {
  addMoneyConfigurationInvalid,
  addMoneyConfigurationUnavailable,
  createUnavailableAddMoneyConfigurationResolver,
} from "./addMoneyConfigurationResolver.js";

const OPERATION = "ADD_MONEY_DIAMOND_4";
const SERVICE_CODE = "Diamond 4";

function createAddMoneyService({ repository, provider, configurationResolver = createUnavailableAddMoneyConfigurationResolver(), now = () => new Date(), requestId = randomUUID }) {
  async function initiate({ actorId, customer, amount, redirectUrl, operator, idempotencyKey }) {
    if (!actorId) throw invalid("Authentication required", "UNAUTHORIZED");
    validateIdempotencyKey(idempotencyKey);
    if (!customer || typeof customer.name !== "string" || !customer.name.trim() || customer.name.trim().length > 100 || !isValidMobile(customer.phone) || !isValidEmail(customer.email)) throw invalid("Valid customer name, phone, and email are required");
    if (typeof operator !== "string" || !operator || operator.trim() !== operator || operator.length > 32) throw invalid("A valid operator identifier is required", "OPERATOR_INVALID");

    const normalizedCustomer = {
      name: customer.name.trim(),
      phone: normalizeMobile(customer.phone),
      email: normalizeEmail(customer.email),
    };
    const amountPaise = parsePaise(amount);
    const payloadHash = hashIdempotencyPayload({
      operation: OPERATION,
      customer: normalizedCustomer,
      amountPaise: amountPaise.toString(),
      serviceCode: SERVICE_CODE,
      operator,
      currency: "INR",
    });
    const idempotencyScope = createIdempotencyScope(actorId, OPERATION, idempotencyKey);

    // Lookup before reading live rates. A replay must remain bound to the original
    // transaction and its historical rate/configuration snapshot.
    const existing = await repository.findIdempotentInitiation(idempotencyScope);
    if (existing) return replay(existing, payloadHash);

    let redirect;
    try { redirect = new URL(redirectUrl); } catch { throw new ApiError(503, "Payment return URL is not configured", [], "PAYMENT_CONFIGURATION_ERROR"); }
    if (redirect.protocol !== "https:") throw new ApiError(503, "Payment return URL is not configured", [], "PAYMENT_CONFIGURATION_ERROR");

    const configuration = await resolveConfiguration(configurationResolver, { userId: actorId, serviceCode: SERVICE_CODE, operator });
    if (typeof provider.assertReady === "function") await provider.assertReady();
    const configuredLevels = new Set();
    for (const item of configuration.commissions) {
      const level = Number(item?.hierarchyLevel);
      if (!Number.isSafeInteger(level) || level < 1 || configuredLevels.has(level) || !isRateConfiguration(item)) {
        throw addMoneyConfigurationInvalid();
      }
      configuredLevels.add(level);
    }
    if (!isRateConfiguration(configuration.serviceCharge) || (configuration.instantCharge !== null && !isRateConfiguration(configuration.instantCharge))) {
      throw addMoneyConfigurationInvalid();
    }
    const ancestry = await repository.listEligibleAncestors({ userId: actorId, hierarchyLevels: [...configuredLevels] });
    if (!ancestry || ancestry.eligibilityResolved !== true || !Array.isArray(ancestry.ancestors)) {
      throw invalid("Eligible ancestor set could not be verified", "HIERARCHY_CONFIGURATION_INVALID");
    }
    const ancestors = ancestry.ancestors;
    const ancestorIds = new Set();
    for (const ancestor of ancestors) {
      const userId = ancestor?.userId;
      const level = Number(ancestor?.hierarchyLevel);
      if ((typeof userId !== "string" && typeof userId !== "number") || !/^\d{1,20}$/.test(String(userId)) || BigInt(userId) < 1n || !Number.isSafeInteger(level) || level < 1) {
        throw invalid("Hierarchy repository returned an invalid eligible ancestor", "HIERARCHY_CONFIGURATION_INVALID");
      }
      const id = String(userId);
      if (id === String(actorId) || ancestorIds.has(id)) {
        throw invalid("Hierarchy repository returned an invalid eligible ancestor", "HIERARCHY_CONFIGURATION_INVALID");
      }
      ancestorIds.add(id);
    }
    const commissions = ancestors.map((ancestor) => {
      const commission = configuration.commissions?.find((item) => Number(item.hierarchyLevel) === Number(ancestor.hierarchyLevel));
      if (!commission) throw addMoneyConfigurationInvalid();
      return { userId: ancestor.userId, hierarchyLevel: ancestor.hierarchyLevel, type: commission.type, value: commission.value };
    });
    const charges = calculateOperatorCharges({
      amount: amountPaise.toString(),
      serviceCharge: configuration.serviceCharge,
      instantCharge: configuration.instantCharge ?? null,
      commissions,
    });
    const request_id = requestId();
    const transaction = {
      request_id,
      operation: OPERATION,
      idempotency_key: idempotencyKey,
      idempotency_payload_hash: payloadHash,
      txn_id: null, // Source/ownership contract is not confirmed; never fabricate it.
      gateway: "PREMIUM_PG_3",
      user_id: actorId,
      initiator_user_id: actorId,
      amount_paise: amountPaise.toString(),
      payment_mode: null,
      utr: null,
      charges,
      settlement_amount_paise: null,
      gateway_response: null,
      initiation_status_code: "PENDING",
      intended_settlement_mode: charges.settlementMode,
      currency: "INR",
      service_code: SERVICE_CODE,
      operator,
      // These legacy nullable references are left empty until the teammate-owned
      // Scheme Manager contract is integrated. Calculation data is snapshotted below.
      scheme_id: null,
      scheme_configuration_id: null,
      configuration_snapshot: {
        serviceCode: SERVICE_CODE,
        operator,
        serviceCharge: rateProjection(configuration.serviceCharge),
        instantCharge: configuration.instantCharge == null ? null : rateProjection(configuration.instantCharge),
        commissions,
      },
      status: "PENDING",
      settlement_status: "UNCONFIRMED",
      created_at: now(),
    };

    // The unique (user, operation, key) constraint must arbitrate concurrent
    // requests. Only the call that atomically creates the row may contact PG3.
    const creation = await repository.persistInitiation(transaction);
    if (!creation || typeof creation.created !== "boolean" || !creation.transaction) {
      throw unavailable("Payment repository did not confirm the idempotent create result");
    }
    if (!creation.created) return replay(creation.transaction, payloadHash);
    if (creation.transaction.idempotency_payload_hash !== payloadHash) {
      throw unavailable("Payment repository returned a mismatched idempotency record");
    }

    const stored = creation.transaction;
    let redirectResult;
    try {
      redirectResult = await provider.initiate({
        customer_name: normalizedCustomer.name,
        customer_phone: normalizedCustomer.phone,
        customer_email: normalizedCustomer.email,
        amount: formatRupees(BigInt(stored.amount_paise)),
        redirect_url: redirect.toString(),
        requestId: stored.request_id,
      });
    } catch (error) {
      const confirmedFailure = error.initiationStatusCode === "TXF";
      const uncertain = !confirmedFailure;
      const patch = {
        initiation_status_code: confirmedFailure ? "TXF" : "UNKNOWN",
        status: confirmedFailure ? "FAILED" : "PENDING",
        reconciliation_required: uncertain,
        gateway_response: confirmedFailure ? { statuscode: "TXF" } : null,
      };
      try { await repository.updateInitiation(stored.request_id, patch); }
      catch { throw unavailable("Initiation result could not be persisted; reconciliation is required"); }
      if (uncertain) throw unavailable("Provider initiation outcome is uncertain; do not retry automatically");
      throw new ApiError(502, "Payment initiation was rejected by the provider", [], "PROVIDER_REJECTED");
    }

    const patch = {
      gateway_order_id: redirectResult.orderId,
      payment_url: redirectResult.paymentUrl,
      initiation_status_code: "TXN",
      status: "PENDING",
      gateway_response: { statuscode: "TXN" },
    };
    try { await repository.updateInitiation(stored.request_id, patch); }
    catch { throw unavailable("Payment initiation needs reconciliation"); }

    return initiationResponse({ ...stored, ...patch, updated_at: now() }, false);
  }

  return Object.freeze({ initiate });
}

async function resolveConfiguration(resolver, request) {
  if (!resolver || typeof resolver.resolveConfiguration !== "function") throw addMoneyConfigurationUnavailable();
  let result;
  try {
    result = await resolver.resolveConfiguration(request);
  } catch {
    throw addMoneyConfigurationUnavailable();
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw addMoneyConfigurationInvalid();
  if (result.status === "UNSUPPORTED") throw invalid("Unsupported service/operator", "OPERATOR_INVALID");
  if (result.status === "NOT_CONFIGURED" || result.status === "UNAVAILABLE") throw addMoneyConfigurationUnavailable();
  if (result.status !== "RESOLVED") throw addMoneyConfigurationInvalid();
  const configuration = result.configuration;
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration) ||
      configuration.serviceCode !== request.serviceCode || configuration.operator !== request.operator ||
      !Array.isArray(configuration.commissions)) {
    throw addMoneyConfigurationInvalid();
  }
  return configuration;
}

function isRateConfiguration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !["percentage", "flat"].includes(value.type) || typeof value.value !== "string") return false;
  return value.type === "flat"
    ? /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value.value)
    : /^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(value.value);
}

function rateProjection({ type, value }) { return { type, value }; }

function replay(transaction, expectedPayloadHash) {
  assertIdempotencyPayloadMatches(transaction, expectedPayloadHash);
  return initiationResponse(transaction, true);
}

function initiationResponse(transaction, replayed) {
  if (!transaction.id || !transaction.request_id || !/^\d+$/.test(String(transaction.amount_paise)) || !transaction.charges) {
    throw unavailable("Stored payment transaction is incomplete");
  }
  const status = transaction.status;
  if (!["PENDING", "SUCCESS", "FAILED"].includes(status)) throw unavailable("Stored payment transaction has an invalid status");
  const canResumeCheckout = status === "PENDING" && transaction.initiation_status_code === "TXN" && isHttpsUrl(transaction.payment_url) && typeof transaction.gateway_order_id === "string" && transaction.gateway_order_id.length > 0;
  const response = {
    transactionId: transaction.id,
    request_id: transaction.request_id,
    gateway: transaction.gateway,
    order_id: transaction.gateway_order_id || null,
    initiation_status_code: transaction.initiation_status_code,
    payment_url: canResumeCheckout ? transaction.payment_url : null,
    amount: formatRupees(BigInt(transaction.amount_paise)),
    charges: publicCharges(transaction.charges),
    status,
    settlement_status: transaction.settlement_status,
    intended_settlement_mode: transaction.intended_settlement_mode,
    reconciliation_required: Boolean(transaction.reconciliation_required || transaction.initiation_status_code === "UNKNOWN" || (status === "PENDING" && !canResumeCheckout)),
    replayed,
  };
  return response;
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function publicCharges(charges) {
  return {
    serviceChargePaise: String(charges.serviceChargePaise),
    instantChargePaise: String(charges.instantChargePaise),
    totalInitiatorChargePaise: String(charges.totalInitiatorChargePaise),
    settlementMode: charges.settlementMode,
  };
}

function formatRupees(paise) { return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`; }

export { OPERATION, SERVICE_CODE, createAddMoneyService, formatRupees, initiationResponse, publicCharges };
