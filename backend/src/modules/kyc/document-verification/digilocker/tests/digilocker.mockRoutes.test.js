import "../../../../auth/setupEnv.js";
import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";

process.env.APP_ENV = "test";
process.env.IDTO_PROVIDER_MODE = "mock";
process.env.IDTO_SKIP_XML_SIGNATURE_VERIFICATION = "false";
process.env.IDTO_MOCK_BASE_URL = "http://127.0.0.1:3000";

const { default: kycRoutes } = await import("../../../kyc.routes.js");

test("DigiLocker, Aadhaar and PAN routes are mounted while unrelated gated routes remain unmounted", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/kyc", kycRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const address = server.address();
    const requests = [
      ["GET", "/api/kyc/digilocker/mock-authorize?state=state&document=ADHAR", 400],
      ["POST", "/api/kyc/digilocker/aadhaar/initiate", 401],
      ["GET", "/api/kyc/digilocker/aadhaar/status/", 401],
      ["POST", "/api/kyc/pan/verify", 401],
      ["PUT", "/api/kyc/bank-details", 404],
      ["POST", "/api/kyc/media/restart", 404],
    ];
    for (const [method, path, expectedStatus] of requests) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
      assert.equal(response.status, expectedStatus, `${method} ${path}`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
