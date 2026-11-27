import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { test } from "node:test";
import authModel from "../auth/auth.model.js";
import { getAuthConfig, JWT_AUDIENCE, JWT_ISSUER } from "../../config/auth.js";
import { errorHandler } from "../../middlewares/error.middleware.js";
import { createPaymentRouter } from "./payment.routes.js";
import { createSchemeRouter } from "../schemes/scheme.routes.js";
import { unavailableRepository } from "./payment.repository.js";

const ENV_KEYS = ["JWT_SECRET", "JWT_EXPIRES_IN", "NIXASOFT_PREMIUM_PG3_REDIRECT_URL"];

async function withApi({ schemeRepository, paymentRepository, paymentProvider, configurationResolver, payoutProvider, billProvider }, run) {
  const oldEnv = Object.fromEntries(ENV_KEYS.map((name) => [name, process.env[name]]));
  const oldActive = authModel.isUserActive;
  const oldAdmin = authModel.isAdmin;
  const secret = "route-test-secret-value-0123456789-abcdefghijklmnopqrstuvwxyz";
  Object.assign(process.env, { JWT_SECRET: secret, JWT_EXPIRES_IN: "5m", NIXASOFT_PREMIUM_PG3_REDIRECT_URL: "https://merchant.example/return" });
  authModel.isUserActive = async () => true;
  authModel.isAdmin = async (userId) => String(userId) === "1";

  const app = express();
  app.use(express.json());
  app.use("/api/schemes", createSchemeRouter({ repository: schemeRepository }));
  app.use("/api/payments", createPaymentRouter({ repository: paymentRepository, provider: paymentProvider, configurationResolver, payoutProvider, billProvider }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (userId) => jwt.sign({}, getAuthConfig().secret, { subject: String(userId), issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
  try {
    await run({ base, token });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    authModel.isUserActive = oldActive;
    authModel.isAdmin = oldAdmin;
    for (const name of ENV_KEYS) {
      if (oldEnv[name] === undefined) delete process.env[name];
      else process.env[name] = oldEnv[name];
    }
  }
}

function bearer(token) { return { Authorization: `Bearer ${token}` }; }

test("scheme routes reject unauthenticated and non-admin writes and scope list/config projections", async () => {
  const calls = [];
  const repository = {
    async listAvailableSchemesForUser(userId) { calls.push(["list-user", userId]); return [{ id: 4, name: "Assigned Scheme", privateRate: "secret" }]; },
    async listAllSchemes() { calls.push(["list-all"]); return [{ id: 4, name: "Assigned Scheme" }]; },
    async findSafeConfigurationForUser(args) { calls.push(["safe-config", args]); return { schemeId: 4, serviceCharge: { type: "flat", value: "1.00" }, instantCharge: null, commissions: [{ hierarchyLevel: 1, type: "flat", value: "88.00" }], otherRate: "secret" }; },
    async createScheme() { calls.push(["create"]); return { id: 5, name: "New" }; },
  };
  await withApi({ schemeRepository: repository }, async ({ base, token }) => {
    const noAuth = await fetch(`${base}/api/schemes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "New" }) });
    assert.equal(noAuth.status, 401);
    const denied = await fetch(`${base}/api/schemes`, { method: "POST", headers: { ...bearer(token(52)), "Content-Type": "application/json" }, body: JSON.stringify({ name: "New" }) });
    assert.equal(denied.status, 403);
    const deniedAssignment = await fetch(`${base}/api/schemes/4/users/99`, { method: "PUT", headers: bearer(token(52)) });
    assert.equal(deniedAssignment.status, 403);
    assert.equal(calls.length, 0);

    const list = await fetch(`${base}/api/schemes`, { headers: bearer(token(52)) });
    assert.equal(list.status, 200);
    const listJson = await list.json();
    assert.deepEqual(calls[0], ["list-user", 52]);
    assert.equal("privateRate" in listJson.data[0], false);

    const config = await fetch(`${base}/api/schemes/me/services/Diamond%204/operators/UPI`, { headers: bearer(token(52)) });
    assert.equal(config.status, 200);
    const configJson = await config.json();
    assert.equal("commissions" in configJson.data, false);
    assert.equal("otherRate" in configJson.data, false);
    assert.deepEqual(calls.find(([kind]) => kind === "safe-config"), ["safe-config", { userId: 52, serviceCode: "Diamond 4", operator: "UPI" }]);
  });
});

test("scheme admin list and unavailable persistence are protected at the HTTP boundary", async () => {
  await withApi({ schemeRepository: { async listAvailableSchemesForUser() { throw Object.assign(new Error("unavailable"), { statusCode: 503, code: "PAYMENT_CAPABILITY_UNAVAILABLE" }); }, async listAllSchemes() { throw Object.assign(new Error("unavailable"), { statusCode: 503, code: "PAYMENT_CAPABILITY_UNAVAILABLE" }); } } }, async ({ base, token }) => {
    const deniedAdminList = await fetch(`${base}/api/schemes/admin`, { headers: bearer(token(52)) });
    assert.equal(deniedAdminList.status, 403);
    const allowedAdminList = await fetch(`${base}/api/schemes/admin`, { headers: bearer(token(1)) });
    assert.equal(allowedAdminList.status, 503);
    const userList = await fetch(`${base}/api/schemes`, { headers: bearer(token(52)) });
    assert.equal(userList.status, 503);
  });
});

test("payment route ignores spoofed user IDs and derives both transaction identities from JWT", async () => {
  let persisted;
  let providerCalls = 0;
  let providerPayload;
  const repository = {
    async findIdempotentInitiation({ userId, operation, idempotencyKey }) {
      return persisted && String(persisted.user_id) === String(userId) && persisted.operation === operation && persisted.idempotency_key === idempotencyKey ? persisted : null;
    },
    async listEligibleAncestors() { return { eligibilityResolved: true, ancestors: [] }; },
    async persistInitiation(transaction) {
      if (persisted) return { created: false, transaction: persisted };
      persisted = { ...transaction, id: 12 };
      return { created: true, transaction: persisted };
    },
    async updateInitiation(_requestId, patch) { Object.assign(persisted, patch); },
  };
  const provider = { assertReady() {}, async initiate(payload) { providerCalls++; providerPayload = payload; return { orderId: "provider-order", paymentUrl: "https://checkout.example/session" }; } };
  const resolverCalls = [];
  const configurationResolver = { async resolveConfiguration(request) {
    resolverCalls.push(request);
    return { status: "RESOLVED", configuration: { serviceCode: request.serviceCode, operator: request.operator, serviceCharge: { type: "flat", value: "0.00" }, instantCharge: null, commissions: [] } };
  } };
  await withApi({ paymentRepository: repository, paymentProvider: provider, configurationResolver }, async ({ base, token }) => {
    const unauthenticated = await fetch(`${base}/api/payments/add-money`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "route-key-123456" },
      body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI" }),
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${base}/api/payments/add-money`, {
      method: "POST",
      headers: { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "route-key-123456" },
      body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI", userId: 999, initiator_user_id: 999, redirect_url: "https://attacker.example" }),
    });
    assert.equal(response.status, 201);
    assert.equal(persisted.user_id, "52");
    assert.equal(persisted.initiator_user_id, "52");
    assert.equal("customer_name" in persisted, false);
    assert.equal("customer_phone" in persisted, false);
    assert.equal("customer_email" in persisted, false);
    assert.equal(providerPayload.customer_email, "payer@example.com");
    assert.equal(providerCalls, 1);
    const result = await response.json();
    assert.equal(result.data.status, "PENDING");
    assert.equal(result.data.payment_url, "https://checkout.example/session");
    assert.deepEqual(resolverCalls, [{ userId: "52", serviceCode: "Diamond 4", operator: "UPI" }]);

    delete process.env.NIXASOFT_PREMIUM_PG3_REDIRECT_URL;
    const replay = await fetch(`${base}/api/payments/add-money`, {
      method: "POST",
      headers: { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "route-key-123456" },
      body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI", redirect_url: "https://attacker.example" }),
    });
    assert.equal(replay.status, 200);
    const replayJson = await replay.json();
    assert.equal(replayJson.data.transactionId, result.data.transactionId);
    assert.equal(replayJson.data.payment_url, result.data.payment_url);
    assert.equal(replayJson.data.replayed, true);
    assert.equal(providerCalls, 1);
    assert.equal(resolverCalls.length, 1);
  });
});

test("payout and bill creation routes return 200 for stored idempotency replays", async () => {
  const payouts = new Map();
  const enquiries = new Map();
  const scopeKey = ({ userId, operation, idempotencyKey }) => `${userId}:${operation}:${idempotencyKey}`;
  let payoutProviderCalls = 0;
  let billProviderCalls = 0;
  const paymentRepository = {
    async findIdempotentPayout(scope) { return payouts.get(scopeKey(scope)) || null; },
    async findBeneficiaryForUser({ userId, beneficiaryId }) { return String(userId) === "52" ? { id: beneficiaryId } : null; },
    async assertPayoutBeneficiaryEligible() {},
    async persistPayout(transaction) {
      const key = scopeKey({ userId: transaction.user_id, operation: transaction.operation, idempotencyKey: transaction.idempotency_key });
      if (payouts.has(key)) return { created: false, transaction: payouts.get(key) };
      const stored = { ...transaction, id: 11 };
      payouts.set(key, stored);
      return { created: true, transaction: stored };
    },
    async updatePayout(requestId, patch) { const stored = [...payouts.values()].find((item) => item.request_id === requestId); Object.assign(stored, patch); return stored; },
    async findIdempotentBillEnquiry(scope) { return enquiries.get(scopeKey(scope)) || null; },
    async persistBillEnquiry(transaction) {
      const key = scopeKey({ userId: transaction.user_id, operation: transaction.operation, idempotencyKey: transaction.idempotency_key });
      if (enquiries.has(key)) return { created: false, enquiry: enquiries.get(key) };
      const stored = { ...transaction, id: 12 };
      enquiries.set(key, stored);
      return { created: true, enquiry: stored };
    },
    async updateBillEnquiry(requestId, patch) { const stored = [...enquiries.values()].find((item) => item.request_id === requestId); Object.assign(stored, patch); return stored; },
  };
  const payoutProvider = { assertConfigured() {}, async initiatePayout() { payoutProviderCalls++; return { status: "PENDING", providerReference: "provider-ref" }; } };
  const billProvider = { assertConfigured() {}, async enquireBill() { billProviderCalls++; return { normalized: true }; } };
  await withApi({ paymentRepository, payoutProvider, billProvider }, async ({ base, token }) => {
    const payoutBody = JSON.stringify({ beneficiaryId: "beneficiary-1", amount: "10.00" });
    const payoutHeaders = { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "payout-route-123" };
    const payoutFirst = await fetch(`${base}/api/payments/payouts`, { method: "POST", headers: payoutHeaders, body: payoutBody });
    const payoutReplay = await fetch(`${base}/api/payments/payouts`, { method: "POST", headers: payoutHeaders, body: payoutBody });
    assert.equal(payoutFirst.status, 201);
    assert.equal(payoutReplay.status, 200);
    assert.equal((await payoutReplay.json()).data.replayed, true);
    assert.equal(payoutProviderCalls, 1);

    const billBody = JSON.stringify({ customerReference: "customer-ref" });
    const billHeaders = { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "bill-route-123" };
    const billFirst = await fetch(`${base}/api/payments/credit-card-bill-2/enquiries`, { method: "POST", headers: billHeaders, body: billBody });
    const billReplay = await fetch(`${base}/api/payments/credit-card-bill-2/enquiries`, { method: "POST", headers: billHeaders, body: billBody });
    assert.equal(billFirst.status, 201);
    assert.equal(billReplay.status, 200);
    assert.equal((await billReplay.json()).data.replayed, true);
    assert.equal(billProviderCalls, 1);
  });
});

test("payment routes reject invalid idempotency/operator values and keep unavailable persistence fail-closed", async () => {
  let providerCalls = 0;
  const provider = { assertReady() {}, async initiate() { providerCalls++; throw new Error("must not call"); } };
  const repository = { async findIdempotentInitiation() { return null; } };
  const configurationResolver = { async resolveConfiguration({ operator }) {
    return operator === "UNKNOWN" ? { status: "UNSUPPORTED" } : { status: "NOT_CONFIGURED" };
  } };
  await withApi({ paymentRepository: repository, paymentProvider: provider, configurationResolver }, async ({ base, token }) => {
    const headers = { ...bearer(token(52)), "Content-Type": "application/json" };
    const body = JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI" });
    const noKey = await fetch(`${base}/api/payments/add-money`, { method: "POST", headers, body });
    assert.equal(noKey.status, 400);
    const invalidOperator = await fetch(`${base}/api/payments/add-money`, { method: "POST", headers: { ...headers, "Idempotency-Key": "route-key-123456" }, body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UNKNOWN" }) });
    assert.equal(invalidOperator.status, 400);
    assert.equal(providerCalls, 0);
  });

  await withApi({ paymentRepository: unavailableRepository() }, async ({ base, token }) => {
    const response = await fetch(`${base}/api/payments/add-money`, { method: "POST", headers: { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "route-key-123456" }, body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI" }) });
    assert.equal(response.status, 503);
  });
});

test("Add Money route returns explicit configuration-unavailable response when no resolver is integrated", async () => {
  let providerCalls = 0;
  const repository = { async findIdempotentInitiation() { return null; } };
  const provider = { async initiate() { providerCalls++; } };
  await withApi({ paymentRepository: repository, paymentProvider: provider }, async ({ base, token }) => {
    const response = await fetch(`${base}/api/payments/add-money`, {
      method: "POST",
      headers: { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "config-route-1234" },
      body: JSON.stringify({ customer: { name: "Payer", phone: "9876543210", email: "payer@example.com" }, amount: "10.00", operator: "UPI" }),
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, "ADD_MONEY_CONFIGURATION_UNAVAILABLE");
    assert.equal(providerCalls, 0);
  });
});

test("status route passes authenticated owner scope and returns not found across users", async () => {
  const queries = [];
  const repository = { async findTransactionForUser(userId, requestId) {
    queries.push([userId, requestId]);
    if (String(userId) !== "52") return null;
    return { id: 4, request_id: requestId, gateway: "PREMIUM_PG_3", amount_paise: "1050", currency: "INR", status: "PENDING", initiation_status_code: "TXN", settlement_status: "UNCONFIRMED", intended_settlement_mode: "T_PLUS_1", created_at: "created", updated_at: "updated", customer_email: "private@example.com", gateway_response: { secret: "private" } };
  } };
  await withApi({ paymentRepository: repository }, async ({ base, token }) => {
    const response = await fetch(`${base}/api/payments/request-123`, { headers: bearer(token(99)) });
    assert.equal(response.status, 404);
    const ownerResponse = await fetch(`${base}/api/payments/request-123`, { headers: bearer(token(52)) });
    assert.equal(ownerResponse.status, 200);
    const body = await ownerResponse.json();
    assert.equal(body.data.status, "PENDING");
    assert.equal(body.data.amount, "10.50");
    assert.equal("customer_email" in body.data, false);
    assert.equal("gateway_response" in body.data, false);
    assert.deepEqual(queries, [["99", "request-123"], ["52", "request-123"]]);
  });
});

test("unconfirmed provider callback transport has no registered route and cannot update payments", async () => {
  let callbackWrites = 0;
  await withApi({ paymentRepository: { async processCallbackAtomically() { callbackWrites++; } } }, async ({ base }) => {
    const response = await fetch(`${base}/api/payments/callbacks/nixasoft-premium-pg-3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "request-1", orderId: "order-1", amount: "1.00", status: "SUCCESS" }),
    });
    assert.equal(response.status, 404);
    assert.equal(callbackWrites, 0);
  });
});

test("payout and bill routes require authentication and use JWT identity for record ownership", async () => {
  const lookups = [];
  const paymentRepository = {
    async findIdempotentPayout() { return null; },
    async findBeneficiaryForUser(args) { lookups.push(["beneficiary", args.userId]); return null; },
    async findBillEnquiryForUser(args) { lookups.push(["enquiry", args.userId]); return null; },
  };
  await withApi({ paymentRepository, payoutProvider: { assertConfigured() {} } }, async ({ base, token }) => {
    const noAuthPayout = await fetch(`${base}/api/payments/payouts/beneficiaries`);
    assert.equal(noAuthPayout.status, 401);
    const noAuthBill = await fetch(`${base}/api/payments/credit-card-bill-2/enquiries/enquiry-123`);
    assert.equal(noAuthBill.status, 401);

    const payout = await fetch(`${base}/api/payments/payouts`, {
      method: "POST",
      headers: { ...bearer(token(52)), "Content-Type": "application/json", "Idempotency-Key": "payout-route-123" },
      body: JSON.stringify({ beneficiaryId: "beneficiary-1", amount: "10.00", userId: 999, actorId: 999 }),
    });
    assert.equal(payout.status, 404);
    const bill = await fetch(`${base}/api/payments/credit-card-bill-2/enquiries/enquiry-123`, { headers: bearer(token(52)) });
    assert.equal(bill.status, 404);
    assert.deepEqual(lookups, [["beneficiary", "52"], ["enquiry", "52"]]);
  });
});
