
import test from "node:test";
import assert from "node:assert/strict";

import { createDigilockerModel } from "../digilocker.model.js";

const VALID_CASE = [{ id: 13 }];
const VALID_AADHAAR = [
  { id: 31, verified_name: "Rahul Kumar Sharma" },
];

function createTestModel(responses) {
  let callIndex = 0;

  const dbPool = {
    async execute() {
      const response = responses[callIndex++];

      if (!response) {
        throw new Error("Unexpected database query");
      }

      return [response];
    },
  };

  return {
    model: createDigilockerModel({ dbPool, env: { APP_ENV: "test" } }),
    getCallCount: () => callIndex,
  };
}

test("returns the verified Aadhaar name for a valid user", async () => {
  const { model, getCallCount } = createTestModel([
    VALID_CASE,
    VALID_AADHAAR,
  ]);

  const name = await model.getVerifiedAadhaarName("52");

  assert.equal(name, "Rahul Kumar Sharma");
  assert.equal(getCallCount(), 2);
});

test("rejects an invalid user ID", async () => {
  const { model, getCallCount } = createTestModel([]);

  await assert.rejects(
    model.getVerifiedAadhaarName(null),
    { message: "INVALID_USER_ID" },
  );

  assert.equal(getCallCount(), 0);
});

test("rejects when the KYC case does not exist", async () => {
  const { model } = createTestModel([[]]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "KYC_CASE_NOT_FOUND" },
  );
});

test("rejects multiple KYC cases", async () => {
  const { model } = createTestModel([
    [{ id: 13 }, { id: 14 }],
  ]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "KYC_CASE_AMBIGUOUS" },
  );
});

test("rejects when no verified Aadhaar record exists", async () => {
  const { model } = createTestModel([
    VALID_CASE,
    [],
  ]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "AADHAAR_VERIFICATION_NOT_COMPLETED" },
  );
});

test("rejects multiple verified Aadhaar records", async () => {
  const { model } = createTestModel([
    VALID_CASE,
    [
      { id: 31, verified_name: "Rahul Kumar Sharma" },
      { id: 32, verified_name: "Rahul Sharma" },
    ],
  ]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "AADHAAR_VERIFICATION_AMBIGUOUS" },
  );
});

test("rejects an empty verified Aadhaar name", async () => {
  const { model } = createTestModel([
    VALID_CASE,
    [{ id: 31, verified_name: "   " }],
  ]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "AADHAAR_VERIFIED_NAME_UNAVAILABLE" },
  );
});

test("rejects a verified Aadhaar name exceeding 100 characters", async () => {
  const { model } = createTestModel([
    VALID_CASE,
    [{ id: 31, verified_name: "A".repeat(101) }],
  ]);

  await assert.rejects(
    model.getVerifiedAadhaarName("52"),
    { message: "AADHAAR_VERIFIED_NAME_UNAVAILABLE" },
  );
});

test("production startup guard rejects persisted development-only PAN mock records", async () => {
  let capturedParams;
  const model = createDigilockerModel({
    dbPool: {
      async execute(_sql, params) {
        capturedParams = params;
        return [[{ development_unverified_count: 1 }]];
      },
    },
    env: { APP_ENV: "production" },
  });
  await assert.rejects(model.assertNoDevelopmentUnverifiedRecords(), /Production startup blocked/);
  assert.deepEqual(capturedParams, [
    "idto_digilocker_v1_provider_trust",
    "idto_digilocker_v1_dev_unverified",
    "idto_pan_detailed_v2_mock",
  ]);
});

test("provider-trust Aadhaar cannot be persisted outside explicitly configured live development", async () => {
  for (const env of [{ APP_ENV: "production" }, { APP_ENV: "development", IDTO_PROVIDER_MODE: "mock" }, { APP_ENV: "development", IDTO_PROVIDER_MODE: "idto" }]) {
    const model = createDigilockerModel({ dbPool: {}, env });
    await assert.rejects(model.completeVerification({ verificationType: "aadhaar", aadhaarTrustMode: "idto_provider", persistIdentity() {} }), /AADHAAR_PROVIDER_TRUST_NOT_ALLOWED/);
  }
});


test("production startup rejects development acknowledgements even with no development-only provider records", async () => {
  const queries = [];
  const model = createDigilockerModel({
    dbPool: { async execute(sql, params) {
      queries.push({sql, params});
      return sql.includes("agreement_acceptances") ? [[{development_agreement_count:1}]] : [[{development_unverified_count:0}]];
    } },
    env: {APP_ENV:"production"},
  });
  await assert.rejects(model.assertNoDevelopmentUnverifiedRecords(), /development KYC acknowledgements/);
  assert.deepEqual(queries[1].params, ["PAYTEAM_DEVELOPMENT_KYC_ACKNOWLEDGEMENT"]);
});
