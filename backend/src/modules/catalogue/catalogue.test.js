import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import "../auth/setupEnv.js";
import { getAuthConfig, JWT_AUDIENCE, JWT_ISSUER } from "../../config/auth.js";
import { errorHandler, notFound } from "../../middlewares/error.middleware.js";
import authModel from "../auth/auth.model.js";
import model from "./catalogue.model.js";
import { parseListOptions, parseServiceId } from "./catalogue.validator.js";

const adminPath = "/api/admin/catalogue";
const service = { id: "13", code: "Diamond 4", name: "Diamond 4", description: null, status: 1, displayOrder: 13 };

test("catalogue validates query bounds and unsigned BIGINT identifiers", () => {
  assert.equal(parseServiceId("18446744073709551615"), "18446744073709551615");
  for (const id of ["18446744073709551616", "01", "0", "-1", "1e3", "1 OR 1=1"]) {
    assert.throws(() => parseServiceId(id), { statusCode: 400 });
  }
  assert.deepEqual(parseListOptions({ status: "0", limit: "100", offset: "100000" }), {
    status: 0, limit: 100, offset: 100000,
  });
  for (const query of [{ status: "2" }, { status: ["0", "1"] }, { limit: "101" }, { limit: "0" }, { offset: "-1" }, { search: "UPI" }]) {
    assert.throws(() => parseListOptions(query), { statusCode: 400 });
  }
});

test("admin catalogue uses existing authentication, validation and response envelopes", async (t) => {
  const originalFlag = process.env.ADMIN_CATALOGUE_ENABLED;
  t.after(() => {
    if (originalFlag === undefined) delete process.env.ADMIN_CATALOGUE_ENABLED;
    else process.env.ADMIN_CATALOGUE_ENABLED = originalFlag;
  });
  delete process.env.ADMIN_CATALOGUE_ENABLED;
  const { default: disabledRouter } = await import("../admin/admin.routes.js?catalogue-disabled");
  process.env.ADMIN_CATALOGUE_ENABLED = "true";
  const { default: enabledRouter } = await import("../admin/admin.routes.js");
  delete process.env.ADMIN_CATALOGUE_ENABLED;

  const app = express();
  app.use("/disabled/api/admin", disabledRouter);
  app.use("/api/admin", enabledRouter);
  app.use(notFound, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");

  const access = t.mock.method(authModel, "getAdminAccess", async (id) =>
    ({ "1": "admin", "2": "active", "3": "inactive" })[id]);
  const read = t.mock.method(model, "findService", async (id) => id === service.id ? service : null);
  const operator = { id: "1", code: "UPI", name: "UPI", operatorType: "TRANSFER_CHANNEL", status: 1 };
  const list = (items, { limit, offset }) => ({ items, pagination: { limit, offset, total: items.length } });
  t.mock.method(model, "listServices", async (options) => list([service], options));
  t.mock.method(model, "listOperators", async (options) => list([operator], options));
  t.mock.method(model, "listServiceOperators", async (_id, options) => list([
    { ...operator, operatorStatus: 1 },
    { ...operator, operatorStatus: 0 },
  ], options));

  function request(path, id, { prefix = "", ...options } = {}) {
    const token = id && jwt.sign({}, getAuthConfig().secret, {
      subject: id, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "1h", ...options,
    });
    return fetch(`http://127.0.0.1:${server.address().port}${prefix}${adminPath}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  assert.equal((await request("/services", "1", { prefix: "/disabled" })).status, 404);
  for (const endpoint of ["/services", "/services/13", "/services/13/operators", "/operators"]) {
    assert.equal((await request(endpoint)).status, 401);
    assert.equal((await request(endpoint, "2")).status, 403);
  }
  assert.equal((await request("/services", "3")).status, 401);
  assert.equal((await request("/services", "1", { expiresIn: -1 })).status, 401);
  assert.equal(access.mock.callCount(), 5);
  assert.equal(read.mock.callCount(), 0);

  assert.equal((await request("/services/18446744073709551616", "1")).status, 400);
  assert.equal((await request("/services/999", "1")).status, 404);
  assert.equal((await request("/services/999/operators", "1")).status, 404);
  assert.equal((await request("/operators?status=1&status=0", "1")).status, 400);
  const services = await request("/services?status=1&limit=1", "1");
  assert.equal(services.status, 200);
  assert.equal(services.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await services.json(), {
    statusCode: 200, success: true, message: "Success",
    data: { items: [service], pagination: { limit: 1, offset: 0, total: 1 } },
  });
  assert.deepEqual((await (await request("/services/13", "1")).json()).data, service);
  assert.deepEqual((await (await request("/operators", "1")).json()).data.items, [operator]);
  const mappings = (await (await request("/services/13/operators", "1")).json()).data.items;
  assert.deepEqual(mappings.map((item) => item.selectable), [true, false]);
});
