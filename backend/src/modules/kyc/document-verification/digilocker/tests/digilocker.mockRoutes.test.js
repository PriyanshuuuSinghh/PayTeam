import "../../../../auth/setupEnv.js";
import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";

process.env.APP_ENV = "test";
process.env.IDTO_PROVIDER_MODE = "mock";
process.env.IDTO_SKIP_XML_SIGNATURE_VERIFICATION = "false";
process.env.IDTO_MOCK_BASE_URL = "http://127.0.0.1:3000";
process.env.PAYTEAM_LIVE_KYC_ENABLED = "false";

const { default: kycRoutes } = await import("../../../kyc.routes.js");
const { default: aadhaarRoutes } = await import("../../aadhaar/aadhaar.routes.js");
const { default: digilockerRoutes } = await import("../digilocker.routes.js");
const { default: panRoutes } = await import("../../pan/pan.routes.js");

async function checkRoutes(router, requests) {
  const app = express();
  app.use(express.json());
  app.use("/api/kyc", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const address = server.address();
    for (const [method, path, expectedStatus] of requests) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
      assert.equal(response.status, expectedStatus, `${method} ${path}`);
      await response.text();
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Live provider and mock routes are not exposed when live KYC is disabled", async () => {
  await checkRoutes(kycRoutes, [
    ["GET", "/api/kyc/capabilities", 401],
    ["GET", "/api/kyc/digilocker/mock-authorize?state=state&document=ADHAR", 404],
    ["POST", "/api/kyc/digilocker/aadhaar/initiate", 404],
    ["GET", "/api/kyc/digilocker/aadhaar/status/", 404],
    ["GET", "/api/kyc/digilocker/callback", 404],
    ["POST", "/api/kyc/pan/verify", 404],
    ["PUT", "/api/kyc/bank-details", 404],
    ["POST", "/api/kyc/media/restart", 404],
  ]);
});

test("Isolated document routers retain mock authorization validation and bearer authentication", async () => {
  const isolated = express.Router();
  isolated.use(aadhaarRoutes, digilockerRoutes, panRoutes);
  await checkRoutes(isolated, [
    ["GET", "/api/kyc/digilocker/mock-authorize?state=state&document=ADHAR", 400],
    ["POST", "/api/kyc/digilocker/aadhaar/initiate", 401],
    ["GET", "/api/kyc/digilocker/aadhaar/status/", 401],
    ["POST", "/api/kyc/pan/verify", 401],
    ["PUT", "/api/kyc/bank-details", 404],
    ["POST", "/api/kyc/media/restart", 404],
  ]);
});
