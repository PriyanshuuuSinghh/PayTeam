import assert from "node:assert/strict";
import { test } from "node:test";
import { getMigrationFiles, orderMigrationNames } from "./migrate.js";

test("PayTeam core migrations follow their prerequisites", () => {
  const names = [
    "008_digilocker_kyc_sessions.sql",
    "001_initial_schema.sql",
    "003_kyc_tables.sql",
    "002_auth_security_tables.sql",
    "005_sync_kyc_cases_schema.sql",
    "007_enforce_single_bank_account_per_case.sql",
    "006_kyc_identity_data.sql",
  ];
  assert.deepEqual(orderMigrationNames(names), [
    "001_initial_schema.sql",
    "002_auth_security_tables.sql",
    "003_kyc_tables.sql",
    "005_sync_kyc_cases_schema.sql",
    "006_kyc_identity_data.sql",
    "007_enforce_single_bank_account_per_case.sql",
    "008_digilocker_kyc_sessions.sql",
  ]);
});

test("migration runner refuses files without an explicit safe order", () => {
  assert.throws(() => orderMigrationNames(["099_unreviewed.sql"]), /explicit ordering/);
});

test("default migrations exclude future financial service SQL", () => {
  const files = getMigrationFiles();
  assert.deepEqual(files, [
    "001_initial_schema.sql",
    "002_auth_security_tables.sql",
    "003_kyc_tables.sql",
    "005_sync_kyc_cases_schema.sql",
    "006_kyc_identity_data.sql",
    "007_enforce_single_bank_account_per_case.sql",
    "008_digilocker_kyc_sessions.sql",
  ]);
  assert.equal(files.length, 7);
  assert.throws(
    () => orderMigrationNames(["009_financial_core.sql"]),
    /explicit ordering/,
  );
});
