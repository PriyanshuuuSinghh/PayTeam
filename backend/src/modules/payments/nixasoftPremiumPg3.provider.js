const ENDPOINT = "https://api.nixasoft.in/api/service/payin/premium-pg-3";
const DEFAULT_TIMEOUT_MS = 15000;

class PremiumPg3Error extends Error {
  constructor(code, initiationStatusCode = null) {
    super(code);
    this.name = "PremiumPg3Error";
    this.code = code;
    this.initiationStatusCode = initiationStatusCode;
    if (code === "PROVIDER_CONFIGURATION_ERROR") this.statusCode = 503;
  }
}

const CAPABILITIES = Object.freeze({ payinStatusEnquiry: "unconfirmed", refunds: "unconfirmed", authenticatedCallbacks: "unconfirmed", instantSettlement: "unconfirmed" });

function createPremiumPg3Provider({ fetchImpl = globalThis.fetch, env = process.env, timeoutMs = Number(env.NIXASOFT_PREMIUM_PG3_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) } = {}) {
  function assertReady() {
    const apiToken = env.NIXASOFT_PREMIUM_PG3_API_TOKEN?.trim();
    if (!apiToken || /replace|placeholder|example/i.test(apiToken)) throw new PremiumPg3Error("PROVIDER_CONFIGURATION_ERROR");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new PremiumPg3Error("PROVIDER_CONFIGURATION_ERROR");
    return apiToken;
  }

  async function initiate({ customer_name, customer_phone, customer_email, amount, redirect_url, requestId }) {
    const apiToken = assertReady();
    if ([customer_name, customer_phone, customer_email, amount, redirect_url, requestId].some((x) => typeof x !== "string" || !x.trim())) throw new PremiumPg3Error("PROVIDER_REQUEST_INVALID");
    let response;
    try {
      response = await fetchImpl(ENDPOINT, { method: "POST", headers: { apiToken, "Content-Type": "application/json" }, body: JSON.stringify({ customer_name, customer_phone, customer_email, amount, redirect_url, requestId }), signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    } catch (error) { throw new PremiumPg3Error(error?.name === "TimeoutError" || error?.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR"); }
    let body;
    try { body = await response.json(); } catch { throw new PremiumPg3Error("PROVIDER_INVALID_RESPONSE"); }
    if (!response.ok) throw new PremiumPg3Error("PROVIDER_REQUEST_FAILED");
    if (body?.statuscode !== "TXN") throw new PremiumPg3Error(body?.statuscode === "TXF" ? "PROVIDER_REJECTED" : "PROVIDER_OUTCOME_UNKNOWN", body?.statuscode === "TXF" ? "TXF" : null);
    if (typeof body.order_id !== "string" || !body.order_id.trim() || typeof body.payment_url !== "string" || !body.payment_url.trim()) throw new PremiumPg3Error("PROVIDER_INVALID_RESPONSE");
    let paymentUrl;
    try { paymentUrl = new URL(body.payment_url); } catch { throw new PremiumPg3Error("PROVIDER_INVALID_RESPONSE"); }
    if (paymentUrl.protocol !== "https:") throw new PremiumPg3Error("PROVIDER_INVALID_RESPONSE");
    return { orderId: body.order_id, paymentUrl: paymentUrl.toString() };
  }
  async function checkStatus() { throw new PremiumPg3Error("PROVIDER_CAPABILITY_UNCONFIRMED"); }
  return Object.freeze({ assertReady, initiate, checkStatus, capabilities: CAPABILITIES });
}

export { ENDPOINT, CAPABILITIES, PremiumPg3Error, createPremiumPg3Provider };
