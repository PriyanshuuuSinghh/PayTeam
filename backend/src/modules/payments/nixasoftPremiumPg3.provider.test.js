import assert from "node:assert/strict";
import { test } from "node:test";
import { ENDPOINT, createPremiumPg3Provider } from "./nixasoftPremiumPg3.provider.js";

const request = { customer_name: "Test Payer", customer_phone: "+919876543210", customer_email: "payer@example.com", amount: "10.00", redirect_url: "https://merchant.example/return", requestId: "request-1" };
const json = (body, ok = true) => ({ ok, json: async () => body });

test("Premium PG 3 adapter sends the documented request and accepts initiation only", async () => {
  let call;
  const provider = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async (...args) => { call = args; return json({ statuscode: "TXN", order_id: "order-1", payment_url: "https://checkout.example/session" }); } });
  assert.deepEqual(await provider.initiate(request), { orderId: "order-1", paymentUrl: "https://checkout.example/session" });
  assert.equal(call[0], ENDPOINT);
  assert.equal(call[1].method, "POST");
  assert.equal(call[1].headers.apiToken, "test-token");
  assert.deepEqual(JSON.parse(call[1].body), request);
  assert.equal(call[1].redirect, "error");
});

test("Premium PG 3 adapter fails closed for missing token, rejection and malformed response", async () => {
  const missing = createPremiumPg3Provider({ env: {}, fetchImpl: async () => assert.fail("must not call provider") });
  await assert.rejects(missing.initiate(request), { code: "PROVIDER_CONFIGURATION_ERROR" });
  for (const body of [
    { statuscode: "TXF", order_id: "o", payment_url: "https://checkout.example" },
    { statuscode: "TXN", order_id: "", payment_url: "https://checkout.example" },
    { statuscode: "TXN", order_id: "o", payment_url: "http://checkout.example" },
  ]) {
    const provider = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async () => json(body) });
    await assert.rejects(provider.initiate(request));
  }
});

test("Premium PG 3 adapter does not expose network error details", async () => {
  const provider = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async () => { throw new Error("token=secret"); } });
  await assert.rejects(provider.initiate(request), (error) => error.code === "PROVIDER_NETWORK_ERROR" && !error.message.includes("secret"));
});

test("Premium PG 3 adapter classifies timeout without leaking request data", async () => {
  const provider = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); } });
  await assert.rejects(provider.initiate(request), (error) => error.code === "PROVIDER_TIMEOUT" && !error.message.includes(request.customer_phone));
});

test("Premium PG 3 adapter rejects unknown statuses and malformed JSON without assuming provider behavior", async () => {
  const unknown = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async () => json({ statuscode: "MAYBE", order_id: "o", payment_url: "https://checkout.example" }) });
  await assert.rejects(unknown.initiate(request), { code: "PROVIDER_OUTCOME_UNKNOWN" });
  const malformed = createPremiumPg3Provider({ env: { NIXASOFT_PREMIUM_PG3_API_TOKEN: "test-token" }, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad body"); } }) });
  await assert.rejects(malformed.initiate(request), { code: "PROVIDER_INVALID_RESPONSE" });
});
