import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import "../auth/setupEnv.js";
import { getAuthConfig, JWT_AUDIENCE, JWT_ISSUER } from "../../config/auth.js";
import { errorHandler, notFound } from "../../middlewares/error.middleware.js";
import authModel from "../auth/auth.model.js";
import model from "./schemeManagement.model.js";
import { parseConfiguration, parseCreate, parseId, parsePagination, parseUpdate, validateDraftAction } from "./schemeManagement.validator.js";

test("scheme input validation restricts metadata and validates identifiers, pagination and draft changes", () => {
  const invalid = { statusCode: 400 };
  assert.equal(parseId("18446744073709551615", "scheme"), "18446744073709551615");
  for (const value of ["0", "01", "-1", "18446744073709551616", "1 OR 1=1"]) {
    assert.throws(() => parseId(value, "scheme"), invalid);
  }
  assert.deepEqual(parsePagination({ limit: "100", offset: "0" }), { limit: 100, offset: 0 });
  assert.throws(() => parsePagination({ limit: ["1", "2"] }), invalid);
  assert.throws(() => parsePagination({ offset: "100001" }), invalid);
  assert.deepEqual(parseCreate({ code: "SCHEME_1", name: " Name " }), { code: "SCHEME_1", name: "Name", description: null });
  for (const body of [{ code: "LEGACY-25", name: "Name" }, { code: "lower", name: "Name" },
    { code: "X", name: "" }, { code: "X", name: "Name", status: 1 }, { code: "X", name: "Name", description: 1 }]) {
    assert.throws(() => parseCreate(body), invalid);
  }
  assert.deepEqual(parseUpdate({ description: null }), { description: null });
  for (const body of [{}, { code: "NEW" }, { status: 1 }, { createdBy: "1" }]) {
    assert.throws(() => parseUpdate(body), invalid);
  }
  assert.equal(parseConfiguration({ status: 0 }), 0);
  assert.throws(() => parseConfiguration({ status: "1" }), invalid);
  assert.throws(() => validateDraftAction({ status: "published" }), invalid);
});

test("scheme admin routes enforce existing authentication and the feature flag", async (t) => {
  const original = process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED;
  t.after(() => {
    if (original === undefined) delete process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED;
    else process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED = original;
  });
  delete process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED;
  const { default: disabled } = await import("../admin/admin.routes.js?schemes-disabled");
  process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED = "true";
  const { default: enabled } = await import("../admin/admin.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/off/api/admin", disabled);
  app.use("/api/admin", enabled);
  app.use(notFound, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  t.mock.method(authModel, "getAdminAccess", async (id) => ({ "1": "admin", "2": "active", "3": "inactive" })[id]);
  const db = t.mock.method(model, "transaction", async () => assert.fail("Unexpected write"));

  function request(path, { id, method = "GET", body, prefix = "", expiresIn = "1h" } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (id) {
      const token = jwt.sign({}, getAuthConfig().secret, {
        subject: id, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn,
      });
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`http://127.0.0.1:${server.address().port}${prefix}/api/admin/schemes${path}`, {
      method, headers, body: JSON.stringify(body),
    });
  }

  assert.equal((await request("", { id: "1", prefix: "/off" })).status, 404);
  for (const [method, path] of [["GET", ""], ["POST", ""], ["PATCH", "/1"], ["GET", "/1/versions"],
    ["POST", "/1/versions"], ["GET", "/1/versions/1"], ["POST", "/1/versions/1/clone"],
    ["GET", "/1/versions/1/services"], ["PUT", "/1/versions/1/services/1"]]) {
    assert.equal((await request(path, { method })).status, 401);
    assert.equal((await request(path, { method, id: "2" })).status, 403);
  }
  assert.equal((await request("", { id: "3" })).status, 401);
  assert.equal((await request("", { id: "1", expiresIn: -1 })).status, 401);
  assert.equal((await request("/18446744073709551616", { id: "1" })).status, 400);
  assert.equal((await request("/1", { method: "PATCH", id: "1", body: { status: 1 } })).status, 400);
  assert.equal((await request("/1/versions", { method: "POST", id: "1", body: { status: "published" } })).status, 400);
  assert.equal((await request("/1/versions/1/publish", { method: "POST", id: "1" })).status, 404);
  assert.equal(db.mock.callCount(), 0);
});
