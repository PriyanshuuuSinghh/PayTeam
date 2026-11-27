import "../../../../auth/setupEnv.js";
import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";

process.env.APP_ENV = "test";
process.env.IDTO_PROVIDER_MODE = "mock";
process.env.IDTO_SKIP_XML_SIGNATURE_VERIFICATION = "false";
process.env.IDTO_MOCK_BASE_URL = "http://127.0.0.1:3000";

const { default: kycRoutes } = await import("../../../kyc.routes.js");

test("provider and media KYC routes stay unmounted until PayTeam disclosures are approved", async () => {
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
      ["GET", "/api/kyc/digilocker/mock-authorize?state=state&document=ADHAR"],
      ["POST", "/api/kyc/digilocker/aadhaar/initiate"],
      ["GET", "/api/kyc/digilocker/aadhaar/status/"],
      ["POST", "/api/kyc/pan/verify"],
      ["PUT", "/api/kyc/bank-details"],
      ["POST", "/api/kyc/media/restart"],
    ];
    for (const [method, path] of requests) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
      assert.equal(response.status, 404, `${method} ${path} must not be mounted`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
