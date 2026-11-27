import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parsePaise, calculateOperatorCharges } from "./money.js";
import { transitionPaymentStatus } from "./paymentState.js";
import { createAddMoneyService } from "./addMoney.service.js";
import { createCallbackService } from "./callback.service.js";
import { createSchemeService } from "../schemes/scheme.service.js";
import { createProductContracts } from "./productContracts.service.js";
import { SERVICE_CATALOGUE, validateServiceOperator } from "../schemes/serviceCatalogue.js";
import { createPaymentStatusService } from "./paymentStatus.service.js";
import { createReconciliationService } from "./reconciliation.service.js";
import { createPayoutProvider } from "./payout/payout.provider.js";
import { createCreditCardBillProvider } from "./credit-card-bill-2/bill.provider.js";
import { createPayoutService } from "./payout/payout.service.js";
import { createCreditCardBill2Service } from "./credit-card-bill-2/creditCardBill2.service.js";

function makeAddMoneyRepository({ ancestors = [], onPersist } = {}) {
  const records = new Map();
  let nextId = 40;
  const scopeKey = ({ userId, operation, idempotencyKey }) => `${userId}:${operation}:${idempotencyKey}`;
  return {
    records,
    async findIdempotentInitiation(scope) { return records.get(scopeKey(scope)) || null; },
    async listEligibleAncestors() { return { eligibilityResolved: true, ancestors }; },
    async persistInitiation(transaction) {
      const key = scopeKey({ userId: transaction.user_id, operation: transaction.operation, idempotencyKey: transaction.idempotency_key });
      const existing = records.get(key);
      if (existing) return { created: false, transaction: existing };
      const stored = { ...transaction, id: ++nextId };
      records.set(key, stored);
      onPersist?.(stored);
      return { created: true, transaction: stored };
    },
    async updateInitiation(requestId, patch) {
      const stored = [...records.values()].find((transaction) => transaction.request_id === requestId);
      if (!stored) throw new Error("transaction not found");
      Object.assign(stored, patch);
      return stored;
    },
  };
}

const DEFAULT_ADD_MONEY_CONFIGURATION = Object.freeze({
  serviceCharge: { type: "flat", value: "1.00" },
  instantCharge: null,
  commissions: [],
});

function createFakeAddMoneyConfigurationResolver(configuration = DEFAULT_ADD_MONEY_CONFIGURATION, { status = "RESOLVED", onResolve } = {}) {
  return {
    async resolveConfiguration(request) {
      onResolve?.(request);
      if (status !== "RESOLVED") return { status };
      return {
        status,
        configuration: {
          serviceCode: request.serviceCode,
          operator: request.operator,
          ...configuration,
        },
      };
    },
  };
}

function createTestAddMoneyService({ configurationResolver, configuration, ...options }) {
  return createAddMoneyService({
    ...options,
    configurationResolver: configurationResolver || createFakeAddMoneyConfigurationResolver(configuration),
  });
}

function input(overrides = {}) {
  return {
    actorId: "52",
    customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" },
    amount: "50.00",
    redirectUrl: "https://merchant.example/return",
    operator: "UPI",
    idempotencyKey: "key-12345678",
    ...overrides,
  };
}

test("money uses integer paise and requires an explicit rounding decision", () => {
  assert.equal(parsePaise("10.25"), 1025n);
  assert.throws(() => parsePaise(10.25), { code: "VALIDATION_ERROR" });
  assert.throws(() => calculateOperatorCharges({ amount: "100.00", serviceCharge: { type: "flat", value: 1.25 } }), { code: "VALIDATION_ERROR" });
  assert.throws(() => parsePaise("1.001"), { code: "VALIDATION_ERROR" });
  assert.throws(() => calculateOperatorCharges({ amount: "0.01", serviceCharge: { type: "percentage", value: "1" } }), { code: "ROUNDING_POLICY_UNRESOLVED" });
});

test("charges and each ancestor commission use original amount; instant mode is optional", () => {
  const base = { amount: "100.00", serviceCharge: { type: "percentage", value: "1" }, commissions: [
    { userId: 8, hierarchyLevel: 1, type: "flat", value: "2.00" },
    { userId: 7, hierarchyLevel: 2, type: "percentage", value: "0.5" },
  ] };
  const t1 = calculateOperatorCharges(base);
  assert.equal(t1.serviceChargePaise, "100");
  assert.equal(t1.commissions[0].amountPaise, "200");
  assert.equal(t1.commissions[1].amountPaise, "50");
  assert.equal(t1.settlementMode, "T_PLUS_1");
  const instant = calculateOperatorCharges({ ...base, instantCharge: { type: "flat", value: "3.00" } });
  assert.equal(instant.instantChargePaise, "300");
  assert.equal(instant.settlementMode, "INSTANT");
});

test("payment status cannot downgrade success to pending or overwrite terminal outcomes", () => {
  assert.equal(transitionPaymentStatus("SUCCESS", "PENDING"), "SUCCESS");
  assert.equal(transitionPaymentStatus("SUCCESS", "FAILED"), "SUCCESS");
  assert.equal(transitionPaymentStatus("FAILED", "SUCCESS"), "FAILED");
  assert.equal(transitionPaymentStatus("PENDING", "SUCCESS"), "SUCCESS");
});

test("Add Money persists before provider call, uses authenticated initiator, and TXN remains payment pending", async () => {
  const calls = [];
  const repository = makeAddMoneyRepository({
    ancestors: [{ userId: "44", hierarchyLevel: 1 }],
    onPersist(transaction) { calls.push(["persist", transaction]); },
  });
  const originalUpdate = repository.updateInitiation;
  repository.updateInitiation = async (...args) => { calls.push(["update", ...args]); return originalUpdate(...args); };
  const service = createTestAddMoneyService({ repository, configuration: { serviceCharge: { type: "flat", value: "1.00" }, instantCharge: null, commissions: [{ hierarchyLevel: 1, type: "flat", value: "2.00" }] }, requestId: () => "merchant-request-1", provider: { assertReady() {}, async initiate(payload) { calls.push(["provider", payload]); return { orderId: "provider-order-1", paymentUrl: "https://checkout.example" }; } } });
  const result = await service.initiate(input());
  assert.deepEqual(calls.map(([type]) => type), ["persist", "provider", "update"]);
  assert.deepEqual(calls[2][2], { gateway_order_id: "provider-order-1", payment_url: "https://checkout.example", initiation_status_code: "TXN", status: "PENDING", gateway_response: { statuscode: "TXN" } });
  assert.equal(calls[0][1].initiator_user_id, "52");
  assert.equal(calls[0][1].txn_id, null);
  assert.equal("customer_name" in calls[0][1], false);
  assert.equal("customer_phone" in calls[0][1], false);
  assert.equal("customer_email" in calls[0][1], false);
  assert.equal(calls[0][1].configuration_snapshot.serviceCode, "Diamond 4");
  assert.equal("schemeId" in calls[0][1].configuration_snapshot, false);
  assert.equal(calls[0][1].scheme_id, null);
  assert.equal(calls[0][1].scheme_configuration_id, null);
  assert.equal(result.status, "PENDING");
  assert.equal(result.settlement_status, "UNCONFIRMED");
  assert.equal("commissions" in result.charges, false);
  assert.equal(calls[0][1].charges.commissions[0].userId, "44");
  assert.equal(calls[1][1].amount, "50.00");
  assert.equal(calls[1][1].customer_name, "Payer");
});

test("Add Money resolves only its scoped calculation configuration through the injected port", async () => {
  let resolvedRequest;
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({
    repository,
    configurationResolver: createFakeAddMoneyConfigurationResolver({
      serviceCharge: { type: "flat", value: "0.50" },
      instantCharge: null,
      commissions: [],
    }, { onResolve(request) { resolvedRequest = request; } }),
    provider: { async initiate() { providerCalls++; return { orderId: "order", paymentUrl: "https://checkout.example" }; } },
  });
  await service.initiate(input());
  assert.deepEqual(resolvedRequest, { userId: "52", serviceCode: "Diamond 4", operator: "UPI" });
  const stored = [...repository.records.values()][0];
  assert.equal(stored.scheme_id, null);
  assert.equal(stored.scheme_configuration_id, null);
  assert.deepEqual(stored.configuration_snapshot, {
    serviceCode: "Diamond 4",
    operator: "UPI",
    serviceCharge: { type: "flat", value: "0.50" },
    instantCharge: null,
    commissions: [],
  });
  assert.equal(providerCalls, 1);
});

test("missing, unavailable, thrown, and malformed Add Money configuration fail closed before persistence or provider calls", async () => {
  const unavailableResolvers = [
    createFakeAddMoneyConfigurationResolver(undefined, { status: "NOT_CONFIGURED" }),
    createFakeAddMoneyConfigurationResolver(undefined, { status: "UNAVAILABLE" }),
    { async resolveConfiguration() { throw new Error("private resolver failure"); } },
    { async resolveConfiguration() { return { status: "RESOLVED", configuration: { serviceCode: "Diamond 4", operator: "UPI", serviceCharge: null, instantCharge: null, commissions: [] } }; } },
    { async resolveConfiguration() { return { status: "RESOLVED", configuration: { serviceCode: "Diamond 4", operator: "VISA", serviceCharge: { type: "flat", value: "1.00" }, instantCharge: null, commissions: [] } }; } },
  ];
  for (const configurationResolver of unavailableResolvers) {
    const repository = makeAddMoneyRepository();
    let providerCalls = 0;
    const service = createTestAddMoneyService({
      repository,
      configurationResolver,
      provider: { async initiate() { providerCalls++; throw new Error("must not call"); } },
    });
    await assert.rejects(service.initiate(input()), (error) => error.statusCode === 503 && ["ADD_MONEY_CONFIGURATION_UNAVAILABLE", "ADD_MONEY_CONFIGURATION_INVALID"].includes(error.code));
    assert.equal(repository.records.size, 0);
    assert.equal(providerCalls, 0);
  }
});

test("configuration resolver identifies an unsupported service/operator without a provider call", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({
    repository,
    configurationResolver: createFakeAddMoneyConfigurationResolver(undefined, { status: "UNSUPPORTED" }),
    provider: { async initiate() { providerCalls++; } },
  });
  await assert.rejects(service.initiate(input({ operator: "UNKNOWN" })), { statusCode: 400, code: "OPERATOR_INVALID" });
  assert.equal(repository.records.size, 0);
  assert.equal(providerCalls, 0);
});

test("Add Money service and route have no direct Scheme Manager catalogue or repository dependency", async () => {
  const serviceSource = await readFile(new URL("./addMoney.service.js", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("./payment.routes.js", import.meta.url), "utf8");
  assert.doesNotMatch(serviceSource, /from ["']\.\.\/schemes\//);
  assert.doesNotMatch(routeSource, /from ["']\.\.\/schemes\//);
  assert.doesNotMatch(serviceSource, /findApplicableConfiguration|findSchemeConfiguration|scheme_assignments|scheme_operator_configurations/);
  assert.doesNotMatch(routeSource, /validateServiceOperator|serviceCatalogue/);
});

test("Add Money idempotency replays stored transaction for the same normalized payload", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  let resolverCalls = 0;
  const service = createTestAddMoneyService({ repository, configurationResolver: createFakeAddMoneyConfigurationResolver(undefined, { onResolve() { resolverCalls++; } }), requestId: () => "same-request", provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: "order-1", paymentUrl: "https://checkout.example" }; } } });
  const first = await service.initiate(input());
  const replayed = await service.initiate(input({ amount: "50", customer: { name: " Payer ", phone: "+91 9876543210", email: "PAYER@example.com" } }));
  assert.equal(first.transactionId, replayed.transactionId);
  assert.equal(replayed.request_id, first.request_id);
  assert.equal(replayed.amount, first.amount);
  assert.equal(replayed.charges.totalInitiatorChargePaise, first.charges.totalInitiatorChargePaise);
  assert.equal(replayed.payment_url, first.payment_url);
  assert.equal(replayed.replayed, true);
  assert.equal(providerCalls, 1);
  assert.equal(resolverCalls, 1);
});

test("stored idempotency replay does not depend on current redirect URL configuration", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: "order", paymentUrl: "https://checkout.example" }; } } });
  const original = await service.initiate(input());
  const replayed = await service.initiate(input({ redirectUrl: undefined }));
  assert.equal(replayed.transactionId, original.transactionId);
  assert.equal(replayed.payment_url, original.payment_url);
  assert.equal(replayed.replayed, true);
  assert.equal(providerCalls, 1);
});

test("same idempotency key with a different amount conflicts without another provider call", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: "o", paymentUrl: "https://checkout.example" }; } } });
  await service.initiate(input());
  await assert.rejects(service.initiate(input({ amount: "51.00" })), { code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 });
  assert.equal(providerCalls, 1);
});

test("same idempotency key with different customer details conflicts", async () => {
  const repository = makeAddMoneyRepository();
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { return { orderId: "o", paymentUrl: "https://checkout.example" }; } } });
  await service.initiate(input());
  await assert.rejects(service.initiate(input({ customer: { name: "Other", phone: "9876543210", email: "payer@example.com" } })), { code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 });
});

test("same key replay for SUCCESS or FAILED never returns a checkout URL", async () => {
  for (const status of ["SUCCESS", "FAILED"]) {
    const repository = makeAddMoneyRepository();
    let providerCalls = 0;
    const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: "o", paymentUrl: "https://checkout.example" }; } } });
    const first = await service.initiate(input());
    const stored = [...repository.records.values()][0];
    stored.status = status;
    const replayed = await service.initiate(input());
    assert.equal(replayed.status, status);
    assert.equal(replayed.payment_url, null);
    assert.equal(replayed.amount, first.amount);
    assert.equal(providerCalls, 1);
  }
});

test("PENDING replay reuses a confirmed checkout URL; UNKNOWN replay returns no URL and requests reconciliation", async () => {
  const pendingRepository = makeAddMoneyRepository();
  let calls = 0;
  const pendingService = createTestAddMoneyService({ repository: pendingRepository, provider: { assertReady() {}, async initiate() { calls++; return { orderId: "order", paymentUrl: "https://checkout.example" }; } } });
  const pending = await pendingService.initiate(input());
  const pendingReplay = await pendingService.initiate(input());
  assert.equal(pendingReplay.payment_url, pending.payment_url);
  assert.equal(calls, 1);

  const unknownRepository = makeAddMoneyRepository();
  const unknownService = createTestAddMoneyService({ repository: unknownRepository, provider: { assertReady() {}, async initiate() { throw Object.assign(new Error("timeout"), { code: "PROVIDER_TIMEOUT" }); } } });
  await assert.rejects(unknownService.initiate(input()), { code: "PAYMENT_CAPABILITY_UNAVAILABLE" });
  const unknownReplay = await unknownService.initiate(input());
  assert.equal(unknownReplay.status, "PENDING");
  assert.equal(unknownReplay.initiation_status_code, "UNKNOWN");
  assert.equal(unknownReplay.payment_url, null);
  assert.equal(unknownReplay.reconciliation_required, true);
});

test("concurrent duplicate Add Money requests persist one transaction and call provider once", async () => {
  const repository = makeAddMoneyRepository();
  let reads = 0;
  let releaseReads;
  const readBarrier = new Promise((resolve) => { releaseReads = resolve; });
  const originalLookup = repository.findIdempotentInitiation;
  repository.findIdempotentInitiation = async (...args) => {
    const result = await originalLookup(...args);
    reads++;
    if (reads === 2) releaseReads();
    await readBarrier;
    return result;
  };
  let providerCalls = 0;
  const service = createTestAddMoneyService({ repository, requestId: (() => { let n = 0; return () => `concurrent-request-${++n}`; })(), provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: "order", paymentUrl: "https://checkout.example" }; } } });
  const [first, second] = await Promise.all([service.initiate(input()), service.initiate(input())]);
  assert.equal(first.transactionId, second.transactionId);
  assert.equal(providerCalls, 1);
  assert.equal(repository.records.size, 1);
});

test("idempotency scope is isolated by authenticated user and malformed ancestor sets fail closed", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { providerCalls++; return { orderId: `order-${providerCalls}`, paymentUrl: "https://checkout.example" }; } } });
  const first = await service.initiate(input());
  const second = await service.initiate(input({ actorId: "53" }));
  assert.notEqual(first.transactionId, second.transactionId);
  assert.equal(providerCalls, 2);

  const invalidAncestors = makeAddMoneyRepository({ ancestors: [{ userId: "44", hierarchyLevel: 1 }, { userId: "44", hierarchyLevel: 2 }] });
  let invalidProviderCalls = 0;
  const invalidService = createTestAddMoneyService({ repository: invalidAncestors, provider: { assertReady() {}, async initiate() { invalidProviderCalls++; } } });
  await assert.rejects(invalidService.initiate(input()), { code: "HIERARCHY_CONFIGURATION_INVALID" });
  assert.equal(invalidAncestors.records.size, 0);
  assert.equal(invalidProviderCalls, 0);
});

test("provider timeout replay never initiates a second provider request", async () => {
  const repository = makeAddMoneyRepository();
  let providerCalls = 0;
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { providerCalls++; throw Object.assign(new Error("hidden provider error"), { code: "PROVIDER_TIMEOUT" }); } } });
  await assert.rejects(service.initiate(input()), { code: "PAYMENT_CAPABILITY_UNAVAILABLE" });
  const replayed = await service.initiate(input());
  assert.equal(replayed.initiation_status_code, "UNKNOWN");
  assert.equal(replayed.payment_url, null);
  assert.equal(providerCalls, 1);
});

test("repository failure and missing provider configuration stop before provider initiation", async () => {
  let providerCalled = false;
  const unavailableRepository = { async findIdempotentInitiation() { throw Object.assign(new Error("unavailable"), { statusCode: 503, code: "PAYMENT_CAPABILITY_UNAVAILABLE" }); } };
  const unavailableService = createTestAddMoneyService({ repository: unavailableRepository, provider: { async initiate() { providerCalled = true; } } });
  await assert.rejects(unavailableService.initiate(input()), { code: "PAYMENT_CAPABILITY_UNAVAILABLE" });
  const repository = makeAddMoneyRepository();
  const configService = createTestAddMoneyService({ repository, provider: { assertReady() { throw Object.assign(new Error("configuration"), { code: "PROVIDER_CONFIGURATION_ERROR" }); }, async initiate() { providerCalled = true; } } });
  await assert.rejects(configService.initiate(input()), { code: "PROVIDER_CONFIGURATION_ERROR" });
  assert.equal(providerCalled, false);
  assert.equal(repository.records.size, 0);

  const noRedirectRepository = makeAddMoneyRepository();
  const noRedirectService = createTestAddMoneyService({ repository: noRedirectRepository, provider: { assertReady() {}, async initiate() { providerCalled = true; } } });
  await assert.rejects(noRedirectService.initiate(input({ redirectUrl: undefined })), { code: "PAYMENT_CONFIGURATION_ERROR", statusCode: 503 });
  assert.equal(noRedirectRepository.records.size, 0);
  assert.equal(providerCalled, false);
});

test("confirmed TXF initiation is persisted as failed and never returns a checkout URL", async () => {
  const repository = makeAddMoneyRepository();
  const service = createTestAddMoneyService({ repository, provider: { assertReady() {}, async initiate() { throw Object.assign(new Error("rejected"), { code: "PROVIDER_REJECTED", initiationStatusCode: "TXF" }); } } });
  await assert.rejects(service.initiate(input()), (error) => error.statusCode === 502 && error.code === "PROVIDER_REJECTED");
  const replayed = await service.initiate(input());
  assert.equal(replayed.status, "FAILED");
  assert.equal(replayed.payment_url, null);
  assert.equal(replayed.initiation_status_code, "TXF");
});

test("callback boundary requires authentication and delegates atomic correlation, amount checks, and duplicate event processing", async () => {
  let applied = 0;
  const calls = [];
  let tx = { status: "PENDING", settlement_status: "UNCONFIRMED" };
  const repository = { async processCallbackAtomically(input) {
    calls.push(input);
    if (input.requestId !== "r") throw Object.assign(new Error("not found"), { code: "PAYMENT_CALLBACK_MISMATCH" });
    if (input.gatewayOrderId !== "order-1") throw Object.assign(new Error("mismatch"), { code: "PAYMENT_CALLBACK_MISMATCH" });
    if (input.amountPaise !== "10000") throw Object.assign(new Error("mismatch"), { code: "PAYMENT_AMOUNT_MISMATCH" });
    if (applied++) return { duplicate: true, ...tx };
    tx = { status: input.transitionStatus(tx.status), settlement_status: "UNCONFIRMED" };
    return { duplicate: false, ...tx };
  } };
  const denied = createCallbackService({ repository });
  await assert.rejects(denied.processNixasoftEvent({ requestId: "r", orderId: "order-1", amount: "101.00", status: "SUCCESS" }));
  const service = createCallbackService({ repository, authenticateCallback: async () => true });
  const event = { requestId: "r", orderId: "order-1", amount: "100.00", status: "SUCCESS", emailId: "payer@example.com", mobileNumber: "9876543210", card_last4: "1234", beneficiaryName: "Payer Name" };
  assert.equal((await service.processNixasoftEvent(event)).status, "SUCCESS");
  assert.equal((await service.processNixasoftEvent(event)).duplicate, true);
  assert.equal(tx.settlement_status, "UNCONFIRMED");
  assert.equal(calls[0].event.authenticationVerified, true);
  assert.deepEqual(calls[0].event.payload, { status: "SUCCESS", requestId: "r", orderId: "order-1", amount: "100.00" });
  assert.equal("emailId" in calls[0].event.payload, false);
  await assert.rejects(service.processNixasoftEvent({ ...event, orderId: "wrong" }), { code: "PAYMENT_CALLBACK_MISMATCH" });
  await assert.rejects(service.processNixasoftEvent({ ...event, amount: "99.00" }), { code: "PAYMENT_AMOUNT_MISMATCH" });
  await assert.rejects(service.processNixasoftEvent({ ...event, requestId: "unknown" }), { code: "PAYMENT_CALLBACK_MISMATCH" });
});

test("callback keeps payment pending until provider event and protects confirmed terminal states", async () => {
  const events = new Set();
  let status = "PENDING";
  const repository = {
    async processCallbackAtomically(input) {
      if (events.has(input.event.fingerprint)) return { duplicate: true, status };
      events.add(input.event.fingerprint);
      status = input.transitionStatus(status);
      return { duplicate: false, status, settlement_status: "UNCONFIRMED" };
    },
  };
  const service = createCallbackService({ repository, authenticateCallback: async () => true });
  const base = { requestId: "request-1", orderId: "order-1", amount: "10.00" };
  assert.equal((await service.processNixasoftEvent({ ...base, status: "PENDING" })).status, "PENDING");
  const success = { ...base, status: "SUCCESS" };
  assert.equal((await service.processNixasoftEvent(success)).status, "SUCCESS");
  assert.equal((await service.processNixasoftEvent(success)).duplicate, true);
  assert.equal((await service.processNixasoftEvent({ ...base, status: "PENDING" })).status, "SUCCESS");
  assert.equal((await service.processNixasoftEvent({ ...base, status: "FAILED" })).status, "SUCCESS");
  assert.equal(transitionPaymentStatus("FAILED", "SUCCESS"), "FAILED");
  assert.equal(transitionPaymentStatus("UNKNOWN", "SUCCESS"), "SUCCESS");
  assert.equal(transitionPaymentStatus("PENDING", "UNKNOWN"), "PENDING");
});

test("callback records failed authentication through protected event boundary", async () => {
  let rejection;
  const service = createCallbackService({ repository: { async recordRejectedCallback(event) { rejection = event; } }, authenticateCallback: async () => false });
  await assert.rejects(service.processNixasoftEvent({ requestId: "request-1", orderId: "order-1", amount: "1.00", status: "PENDING" }), { code: "PAYMENT_CALLBACK_UNAUTHENTICATED" });
  assert.equal(rejection.authenticationVerified, false);
  assert.equal(rejection.processingStatus, "REJECTED_AUTH");
  assert.equal("payload" in rejection, true);
});

test("callback service uses central transitions for FAILED then SUCCESS and keeps settlement separate", async () => {
  let status = "PENDING";
  let settlementStatus = "UNCONFIRMED";
  const service = createCallbackService({
    authenticateCallback: async () => true,
    repository: {
      async processCallbackAtomically(input) {
        status = input.transitionStatus(status);
        return { duplicate: false, status, settlement_status: settlementStatus };
      },
    },
  });
  const base = { requestId: "request-42", orderId: "order-42", amount: "8.00" };
  assert.equal((await service.processNixasoftEvent({ ...base, status: "FAILED" })).status, "FAILED");
  assert.equal((await service.processNixasoftEvent({ ...base, status: "SUCCESS" })).status, "FAILED");
  assert.equal((await service.processNixasoftEvent({ ...base, status: "PENDING" })).status, "FAILED");
  assert.equal(settlementStatus, "UNCONFIRMED");
});

test("scheme service validates scoped service/operator configuration and delegates persistence", async () => {
  const queries = [];
  const schemeRows = [{ id: 3, name: "Diamond 4", isDefault: true, privateCommissionRate: "secret" }];
  const service = createSchemeService({
    async listAvailableSchemesForUser(userId) { queries.push(["user-list", userId]); return schemeRows; },
    async listAllSchemes() { queries.push(["admin-list"]); return schemeRows; },
    async findSafeConfigurationForUser(value) { queries.push(["safe-config", value]); return { schemeId: 3, serviceCharge: { type: "flat", value: "1.00" }, instantCharge: null, commissions: [{ hierarchyLevel: 1, type: "flat", value: "999.00" }], secret: "private" }; },
    async findApplicableConfiguration(value) { queries.push(["internal-config", value]); return { schemeId: 3, serviceCode: value.serviceCode, operator: value.operator }; },
    async setApplicableConfiguration(value) { queries.push(["set-config", value]); return value; },
    async createScheme(value) { return value; },
    async renameScheme(id, name) { return { id, name, isDefault: false }; }, async setDefaultScheme(id) { return { id, name: "Gold", isDefault: true }; }, async assignScheme(value) { return value; }, async findAssignedScheme() { return schemeRows[0]; },
  });
  assert.deepEqual(await service.listForUser("52"), [{ id: 3, name: "Diamond 4", isDefault: true }]);
  assert.deepEqual(queries[0], ["user-list", 52]);
  assert.deepEqual(await service.listAll(), [{ id: 3, name: "Diamond 4", isDefault: true }]);
  assert.deepEqual(await service.getAssigned("52"), { id: 3, name: "Diamond 4", isDefault: true });
  const config = await service.getConfiguration("52", "Diamond 4", "UPI");
  assert.equal(config.schemeId, 3);
  assert.deepEqual(queries.find(([key]) => key === "safe-config"), ["safe-config", { userId: 52, serviceCode: "Diamond 4", operator: "UPI" }]);
  assert.equal("commissions" in config, false);
  assert.equal("secret" in config, false);
  await assert.rejects(service.getConfiguration("52", "Diamond 4", "UNKNOWN"), { code: "OPERATOR_INVALID" });
  await assert.deepEqual(await service.create({ name: "Diamond 4", isDefault: true }), { name: "Diamond 4", isDefault: true });
  await assert.rejects(service.create({ name: "   " }), { code: "VALIDATION_ERROR" });
  assert.deepEqual(await service.setDefault("3"), { id: 3, name: "Gold", isDefault: true });
  assert.equal((await service.assign("1", "52", "3")).actorId, 1);
  const savedConfig = await service.setConfiguration(3, "Diamond 4", "UPI", {
    serviceCharge: { type: "percentage", value: "1.25" },
    instantCharge: null,
    commissions: [{ hierarchyLevel: 1, type: "flat", value: "2.00" }],
  }, "1");
  assert.equal(savedConfig.configuration.commissions[0].hierarchyLevel, 1);
  await assert.rejects(service.setConfiguration(3, "Diamond 4", "UPI", {
    serviceCharge: { type: "flat", value: 1 }, instantCharge: null, commissions: [],
  }, "1"), { code: "RATE_CONFIGURATION_INVALID" });
  await assert.rejects(service.setConfiguration(3, "Silver 1", "UPI", { serviceCharge: { type: "flat", value: "1" }, commissions: [] }, "1"), { code: "OPERATOR_INVALID" });
});

test("service catalogue preserves names and only declares confirmed provider mappings/operators", () => {
  assert.equal(SERVICE_CATALOGUE.length, 28);
  assert.deepEqual(SERVICE_CATALOGUE.filter((service) => service.provider).map(({ id, provider }) => [id, provider]), [
    ["Silver 1", "Nixa Silver 1"], ["Diamond 3", "Nixa Silver 2"],
    ["Diamond 4", "Nixa Premium 3 / NixaSoft Premium PG 3"],
    ["Silver 3", "Nixa Silver 3"], ["Premium 5", "Nixa Premium 4"],
    ["Silver 4", "Nixa Silver 4"], ["Silver 5", "Nixa Silver 5"],
    ["Platinum 2", "Pinlab Yana Grocery"],
  ]);
  assert.deepEqual(SERVICE_CATALOGUE.find((service) => service.id === "Diamond 4").operators, ["MASTERCARD", "RUPAY", "VISA", "UPI"]);
  assert.equal(validateServiceOperator("Diamond 4", "UPI"), true);
  assert.equal(validateServiceOperator("Silver 1", "UPI"), false);
  assert.equal(validateServiceOperator("Diamond 4", "NOT_MAPPED"), false);
});

test("Payout and Bill 2 contracts require idempotency and return NOT_CONFIGURED without provider adapters", async () => {
  const repository = {
    async findIdempotentPayout() { return null; },
    async findIdempotentBillEnquiry() { return null; },
  };
  const products = createProductContracts(repository);
  await assert.rejects(products.createPayout({ actorId: "52", beneficiaryId: "b", amount: "1" }), { code: "IDEMPOTENCY_KEY_REQUIRED" });
  await assert.rejects(products.createPayout({ actorId: "52", beneficiaryId: "b", amount: "1", idempotencyKey: "key-12345678" }), { code: "NOT_CONFIGURED", statusCode: 503 });
  await assert.rejects(products.createBillEnquiry({ actorId: "52", customerReference: "customer-reference", idempotencyKey: "key-12345678" }), { code: "NOT_CONFIGURED", statusCode: 503 });
});

test("Payout and Bill 2 use separate injected client/mapper boundaries, never PG3", async () => {
  const calls = [];
  const payoutProvider = createPayoutProvider({
    client: { async initiatePayout(request) { calls.push(["payout-client", request]); return { raw: "opaque" }; } },
    mapper: { payoutRequest(command) { return { mapped: command.payout.id }; }, payoutResponse() { return { status: "PENDING", providerReference: "internal-ref" }; } },
  });
  const billProvider = createCreditCardBillProvider({
    client: { async enquireBill(request) { calls.push(["bill-client", request]); return { raw: "opaque" }; } },
    mapper: { enquiryRequest(command) { return { reference: command.customerReference }; }, enquiryResponse() { return { snapshot: { amount: "opaque-normalized-data" } }; } },
  });
  assert.deepEqual(await payoutProvider.initiatePayout({ payout: { id: 15 } }), { status: "PENDING", providerReference: "internal-ref" });
  assert.deepEqual(await billProvider.enquireBill({ customerReference: "ref" }), { snapshot: { amount: "opaque-normalized-data" } });
  assert.deepEqual(calls, [["payout-client", { mapped: 15 }], ["bill-client", { reference: "ref" }]]);
});

test("payout persists before provider initiation and replays idempotently within the owner scope", async () => {
  const records = new Map();
  let providerCalls = 0;
  let beneficiaryChecks = 0;
  const keyOf = ({ userId, operation, idempotencyKey }) => `${userId}:${operation}:${idempotencyKey}`;
  const repository = {
    async findIdempotentPayout(scope) { return records.get(keyOf(scope)) || null; },
    async findBeneficiaryForUser({ userId, beneficiaryId }) { return String(userId) === "52" && beneficiaryId === "beneficiary-1" ? { id: beneficiaryId, user_id: userId } : null; },
    async assertPayoutBeneficiaryEligible() { beneficiaryChecks++; },
    async persistPayout(transaction) {
      const key = keyOf({ userId: transaction.user_id, operation: transaction.operation, idempotencyKey: transaction.idempotency_key });
      if (records.has(key)) return { created: false, transaction: records.get(key) };
      const stored = { ...transaction, id: 7 };
      records.set(key, stored);
      return { created: true, transaction: stored };
    },
    async updatePayout(requestId, patch) {
      const stored = [...records.values()].find((record) => record.request_id === requestId);
      Object.assign(stored, patch);
      return stored;
    },
  };
  const provider = { assertConfigured() {}, async initiatePayout({ payout }) { assert.equal(records.size, 1); assert.equal(payout.status, "PENDING"); providerCalls++; return { status: "PENDING", providerReference: "opaque-reference" }; } };
  const service = createPayoutService({ repository, provider, requestId: () => "payout-request-1" });
  const command = { userId: "52", beneficiaryId: "beneficiary-1", amount: "10.00", idempotencyKey: "payout-key-1234" };
  const first = await service.createPayout(command);
  const replay = await service.createPayout(command);
  assert.equal(first.status, "PENDING");
  assert.equal(replay.replayed, true);
  assert.equal(first.payoutId, replay.payoutId);
  assert.equal(providerCalls, 1);
  assert.equal(beneficiaryChecks, 1);
  await assert.rejects(service.createPayout({ ...command, amount: "11.00" }), { code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 });
});

test("payout timeout becomes UNKNOWN and replay does not initiate another provider request", async () => {
  const records = new Map();
  let providerCalls = 0;
  const repository = {
    async findIdempotentPayout({ idempotencyKey }) { return records.get(idempotencyKey) || null; },
    async findBeneficiaryForUser() { return { id: "beneficiary-1" }; },
    async assertPayoutBeneficiaryEligible() {},
    async persistPayout(transaction) { const stored = { ...transaction, id: 8 }; records.set(transaction.idempotency_key, stored); return { created: true, transaction: stored }; },
    async updatePayout(requestId, patch) { const stored = [...records.values()].find((record) => record.request_id === requestId); Object.assign(stored, patch); return stored; },
  };
  const service = createPayoutService({ repository, provider: { assertConfigured() {}, async initiatePayout() { providerCalls++; throw new Error("timeout details are private"); } } });
  const command = { userId: "52", beneficiaryId: "beneficiary-1", amount: "10.00", idempotencyKey: "payout-key-1234" };
  await assert.rejects(service.createPayout(command), { code: "PAYMENT_CAPABILITY_UNAVAILABLE" });
  const replay = await service.createPayout(command);
  assert.equal(replay.status, "UNKNOWN");
  assert.equal(replay.reconciliation_required, true);
  assert.equal(providerCalls, 1);
});

test("credit card bill enquiry and payment use owner-scoped persisted snapshots and separate provider methods", async () => {
  const enquiries = new Map();
  const payments = new Map();
  const providerCalls = [];
  const repository = {
    async findIdempotentBillEnquiry({ idempotencyKey }) { return enquiries.get(idempotencyKey) || null; },
    async persistBillEnquiry(enquiry) { const stored = { ...enquiry, id: "enquiry-1" }; enquiries.set(enquiry.idempotency_key, stored); return { created: true, enquiry: stored }; },
    async updateBillEnquiry(requestId, patch) { const stored = [...enquiries.values()].find((item) => item.request_id === requestId); Object.assign(stored, patch); return stored; },
    async findBillEnquiryForUser({ userId, enquiryId }) { const enquiry = [...enquiries.values()].find((item) => item.id === enquiryId && String(item.user_id) === String(userId)); return enquiry || null; },
    async findIdempotentBillPayment({ idempotencyKey }) { return payments.get(idempotencyKey) || null; },
    async persistBillPayment(payment) { const stored = { ...payment, id: "bill-payment-1" }; payments.set(payment.idempotency_key, stored); return { created: true, payment: stored }; },
    async updateBillPayment(requestId, patch) { const stored = [...payments.values()].find((item) => item.request_id === requestId); Object.assign(stored, patch); return stored; },
    async findBillPaymentForUser({ userId, paymentId }) { const payment = [...payments.values()].find((item) => item.id === paymentId && String(item.user_id) === String(userId)); return payment || null; },
  };
  const provider = {
    assertConfigured() {},
    async enquireBill(command) { providerCalls.push(["enquiry", command]); return { normalizedSnapshot: "opaque-provider-mapped-data" }; },
    async initiateBillPayment(command) { providerCalls.push(["payment", command]); return { status: "PENDING", providerReference: "opaque-reference" }; },
  };
  const service = createCreditCardBill2Service({ repository, provider, requestId: (() => { let count = 0; return () => `bill-request-${++count}`; })() });
  const enquiryCommand = { userId: "52", customerReference: "customer-ref", idempotencyKey: "bill-enquiry-key" };
  const enquiry = await service.createEnquiry(enquiryCommand);
  const replayedEnquiry = await service.createEnquiry(enquiryCommand);
  assert.equal(enquiries.get(enquiryCommand.idempotencyKey).customer_reference, undefined);
  assert.match(enquiries.get(enquiryCommand.idempotencyKey).customer_reference_hash, /^[a-f0-9]{64}$/);
  assert.equal(enquiry.status, "COMPLETED");
  assert.deepEqual(replayedEnquiry.snapshot, enquiry.snapshot);
  assert.equal(replayedEnquiry.replayed, true);
  assert.equal(providerCalls.filter(([kind]) => kind === "enquiry").length, 1);
  await assert.rejects(service.getEnquiry({ userId: "99", enquiryId: enquiry.enquiryId }), { code: "NOT_FOUND", statusCode: 404 });

  const paymentCommand = { userId: "52", enquiryId: enquiry.enquiryId, idempotencyKey: "bill-payment-key" };
  const payment = await service.createPayment(paymentCommand);
  const replayedPayment = await service.createPayment(paymentCommand);
  assert.equal(payment.status, "PENDING");
  assert.equal(replayedPayment.replayed, true);
  assert.equal(replayedPayment.paymentId, payment.paymentId);
  assert.equal(providerCalls.filter(([kind]) => kind === "payment").length, 1);
  await assert.rejects(service.getPayment({ userId: "99", paymentId: payment.paymentId }), { code: "NOT_FOUND", statusCode: 404 });
});

test("payment status service returns an owner-scoped safe projection", async () => {
  let owner;
  const service = createPaymentStatusService({ async findTransactionForUser(userId, requestId) {
    owner = [userId, requestId];
    return { id: 4, request_id: requestId, gateway: "PREMIUM_PG_3", amount_paise: "1050", currency: "INR", status: "PENDING", initiation_status_code: "TXN", settlement_status: "UNCONFIRMED", intended_settlement_mode: "T_PLUS_1", created_at: "created", updated_at: "updated", gateway_response: { secret: "never expose" }, customer_email: "private@example.com" };
  } });
  const result = await service.getStatus("52", "request-123");
  assert.deepEqual(owner, ["52", "request-123"]);
  assert.equal(result.amount, "10.50");
  assert.equal("gateway_response" in result, false);
  assert.equal("customer_email" in result, false);
});

test("customer return or browser redirect does not change server payment status", async () => {
  let serverStatus = "PENDING";
  const service = createPaymentStatusService({ async findTransactionForUser() { return { id: 5, request_id: "request-123", gateway: "PREMIUM_PG_3", amount_paise: "500", currency: "INR", status: serverStatus, initiation_status_code: "TXN", settlement_status: "UNCONFIRMED", intended_settlement_mode: "T_PLUS_1", created_at: "created", updated_at: "updated" }; } });
  // Browser return parameters are not accepted by this read-only status contract.
  assert.equal((await service.getStatus("52", "request-123")).status, "PENDING");
  assert.equal(serverStatus, "PENDING");
});

test("reconciliation boundary only lists candidates and validates limits", async () => {
  let args;
  let attempt;
  const service = createReconciliationService({
    async findReconciliationCandidates(value) { args = value; return [{ request_id: "r1", status: "PENDING" }]; },
    async beginReconciliationAttempt(value) { attempt = value; return { id: 1, ...value, status: "STARTED" }; },
    async finishReconciliationAttempt(value) { attempt = value; return { id: value.attemptId, status: value.status }; },
  });
  assert.deepEqual(await service.listCandidates({ olderThanMinutes: 20, limit: 5 }), [{ request_id: "r1", status: "PENDING" }]);
  assert.deepEqual(args, { olderThanMinutes: 20, limit: 5 });
  assert.deepEqual(await service.beginAttempt({ requestId: "request-123", capability: "PREMIUM_PG_3_PAYIN_STATUS" }), { id: 1, requestId: "request-123", capability: "PREMIUM_PG_3_PAYIN_STATUS", status: "STARTED" });
  assert.deepEqual(await service.finishAttempt({ attemptId: 1, status: "UNRESOLVED" }), { id: 1, status: "UNRESOLVED" });
  await assert.rejects(service.listCandidates({ limit: 1000 }), { code: "VALIDATION_ERROR" });
  await assert.rejects(service.finishAttempt({ attemptId: 1, status: "SUCCESS" }), { code: "VALIDATION_ERROR" });
});
