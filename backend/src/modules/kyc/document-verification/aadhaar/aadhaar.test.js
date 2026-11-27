import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateAadhaarXml } from "./aadhaar.validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "..", "digilocker", "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

test("Aadhaar fixture parsing does not claim signature verification", () => {
  const xml = readFixture("aadhaar.xml");

  const result = validateAadhaarXml(xml);

  assert.equal(Object.hasOwn(result, "signatureVerified"), false);
  assert.equal(Object.hasOwn(result, "verificationMode"), false);
  assert.ok(result.maskedIdentifier);
  assert.ok(result.verifiedName);
  assert.equal(result.aadhaarNumber.length, 12);
  assert.ok(/^\d{12}$/.test(result.aadhaarNumber));
  assert.equal(
    result.maskedIdentifier,
    `XXXXXX${result.aadhaarNumber.slice(-4)}`,
  );
  assert.ok(Array.isArray(result.address));
  assert.ok(result.address.length > 0);
  assert.match(result.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
});

test("validateAadhaarXml rejects tampered XML", () => {
  const xml = readFixture("aadhaar.xml").replace('ret="Y"', 'ret="N"');

  assert.throws(
    () => validateAadhaarXml(xml),
    { code: "INVALID_AADHAAR_DOCUMENT" },
  );
});

test("validateAadhaarXml rejects empty input", () => {
  assert.throws(
    () => validateAadhaarXml(""),
    { code: "INVALID_AADHAAR_DOCUMENT" },
  );
});
