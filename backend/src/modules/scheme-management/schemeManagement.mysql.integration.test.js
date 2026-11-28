import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, realpath } from "node:fs/promises";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

const fkError = ({ code }) => ["ER_NO_REFERENCED_ROW", "ER_NO_REFERENCED_ROW_2"].includes(code);
const immutable = { code: "ER_SIGNAL_EXCEPTION" };

test("scheme management on the disposable MySQL upgrade fixture", {
  skip: process.env.SCHEME_MANAGEMENT_MYSQL_TEST !== "1",
}, async (t) => {
  assert.equal(process.env.DB_HOST, "127.0.0.1");
  assert.equal(process.env.DB_PORT, "3307");
  assert.equal(process.env.DB_NAME, "payteam_kyc");
  assert.equal(process.env.DB_USER, "scheme_v2_migrator");
  assert.ok(!process.env.DB_SSL_CA);
  const expectedDir = await realpath(process.env.CATALOGUE_TEST_DATADIR);
  assert.ok(process.env.CATALOGUE_TEST_SERVER_UUID);

  const connection = await mysql.createConnection({
    host: "127.0.0.1", port: 3307, database: "payteam_kyc", timezone: "Z",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  t.after(() => connection.end());
  await connection.query("SET time_zone = '+00:00'");
  const [[server]] = await connection.query(`
    SELECT @@datadir AS datadir, @@server_uuid AS uuid, @@port AS port,
           @@bind_address AS bindAddress, DATABASE() AS db
  `);
  assert.equal(await realpath(server.datadir), expectedDir);
  assert.equal(server.uuid, process.env.CATALOGUE_TEST_SERVER_UUID);
  assert.equal(server.port, 3307);
  assert.equal(server.bindAddress, "127.0.0.1");
  assert.equal(server.db, "payteam_kyc");

  process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED = "true";
  process.env.JWT_SECRET = "scheme-integration-test-only-signing-secret";
  process.env.JWT_EXPIRES_IN = "1h";
  const { getAuthConfig, JWT_ISSUER, JWT_AUDIENCE } = await import("../../config/auth.js");
  const { default: pool } = await import("../../config/db.js");
  t.after(() => pool.end());
  const { default: model } = await import("./schemeManagement.model.js");
  const { default: router } = await import("../admin/admin.routes.js");
  const { notFound, errorHandler } = await import("../../middlewares/error.middleware.js");
  const app = express();
  app.use(express.json());
  app.use("/api/admin", router);
  app.use(notFound, errorHandler);
  const http = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => http.close(resolve)));
  await once(http, "listening");
  const actor = "30001";
  const customer = "30002";

  async function request(path, expectedStatus, { method = "GET", body, subject = actor } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (subject) {
      const token = jwt.sign({}, getAuthConfig().secret, {
        subject, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "1h",
      });
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`http://127.0.0.1:${http.address().port}/api/admin/schemes${path}`, {
      method, headers, body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, payload.message);
    if (response.ok) assert.equal(response.headers.get("Cache-Control"), "no-store");
    return payload.data;
  }

  await t.test("preserves existing scheme metadata, assignments and migration history", async () => {
    const legacy = await request("/25", 200);
    assert.deepEqual(legacy, {
      id: "25", code: "LEGACY-25", name: "Default-Scheme", description: null, status: 0,
      createdBy: null, updatedBy: null, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-02-01T00:00:00.000Z",
    });
    const seeded = await request("/1", 200);
    assert.equal(seeded.code, "LEGACY-1");
    assert.equal(seeded.name, "Default Scheme");
    assert.equal(seeded.status, 1);
    const [[assignment]] = await connection.query("SELECT CAST(scheme_id AS CHAR) AS schemeId FROM users WHERE id = 30002");
    assert.equal(assignment.schemeId, "25");
    assert.deepEqual((await request("/25/versions", 200)).items, []);
    assert.deepEqual((await request("/1/versions", 200)).items, []);
    const [history] = await connection.query("SELECT migration, sha256 FROM schema_migrations ORDER BY migration");
    assert.deepEqual(history.map(({ migration }) => migration), [
      "001_initial_schema.sql", "002_master_service_operator_catalogue.sql", "003_scheme_versions_and_audit.sql",
    ]);
    for (const { migration, sha256 } of history) {
      const sql = await readFile(new URL(`../../../database/migrations/${migration}`, import.meta.url), "utf8");
      assert.equal(sha256, createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"));
    }
  });

  let scheme;
  let firstDraft;
  let diamondId;
  let clone;
  const suffix = randomUUID().slice(0, 12).toUpperCase();
  const input = { code: `TEST-${suffix}`, name: `Scheme test ${suffix}`, description: "Initial" };

  await t.test("creates inactive schemes with drafts, retrieves and updates metadata, and rejects duplicate codes", async () => {
    await request("", 401, { subject: null });
    await request("", 403, { method: "POST", subject: customer, body: input });
    scheme = await request("", 201, { method: "POST", body: input });
    firstDraft = scheme.initialVersion;
    assert.equal(scheme.status, 0);
    assert.equal(scheme.createdBy, actor);
    assert.equal(firstDraft.versionNumber, 1);
    assert.equal(firstDraft.status, "draft");
    assert.equal(firstDraft.publishedAt, null);
    await request("", 409, { method: "POST", body: { ...input, name: "Different " + suffix } });
    await request("", 409, { method: "POST", body: { ...input, code: "OTHER-" + suffix } });
    assert.equal((await request("/" + scheme.id, 200)).code, input.code);
    assert.deepEqual((await request("?limit=2", 200)).items.map(({ id }) => id), ["1", "25"]);
    const path = "/" + scheme.id;
    const updated = await request(path, 200, { method: "PATCH", body: { name: input.name + " revised", description: null } });
    assert.equal(updated.name, input.name + " revised");
    assert.equal(updated.description, null);
    assert.equal(updated.status, 0);
    assert.equal(updated.updatedBy, actor);
    await request(path, 400, { method: "PATCH", body: { code: "NEW" } });
    await request("/18446744073709551615", 404);
    await request("/18446744073709551616", 400);
    await request(`/25/versions/${firstDraft.id}`, 404);
  });

  await t.test("allocates sequential drafts concurrently and configures catalogue references", async () => {
    const path = `/${scheme.id}/versions`;
    const created = await Promise.all(Array.from({ length: 5 }, () => request(path, 201, { method: "POST" })));
    assert.deepEqual(created.map(({ versionNumber }) => versionNumber).sort((a, b) => a - b), [2, 3, 4, 5, 6]);
    const list = await request(path + "?limit=3", 200);
    assert.deepEqual(list.items.map(({ versionNumber }) => versionNumber), [6, 5, 4]);
    assert.deepEqual(list.pagination, { limit: 3, offset: 0, total: 6 });
    assert.deepEqual(await request(`${path}/${firstDraft.id}`, 200), firstDraft);
    const servicesPath = `${path}/${firstDraft.id}/services`;
    const initial = (await request(servicesPath, 200)).items;
    assert.deepEqual(initial.map(({ code, status }) => [code, status]), [["Diamond 4", 0]]);
    diamondId = initial[0].serviceId;
    const [[bbps]] = await connection.query("SELECT CAST(id AS CHAR) AS id FROM services WHERE code = 'BBPS'");
    await request(`${servicesPath}/${bbps.id}`, 409, { method: "PUT", body: { status: 1 } });
    await request(`${servicesPath}/18446744073709551615`, 404, { method: "PUT", body: { status: 0 } });
    const enabled = await request(`${servicesPath}/${diamondId}`, 200, { method: "PUT", body: { status: 1 } });
    assert.equal(enabled.status, 1);
    await request(`${servicesPath}/${diamondId}`, 200, { method: "PUT", body: { status: 1 } });
  });

  await t.test("enforces duplicate and foreign-key constraints and freezes published and retired configurations", async () => {
    const addVersion = "INSERT INTO scheme_versions (scheme_id, version_number, created_by) VALUES (?, ?, ?)";
    const addService = "INSERT INTO scheme_services (scheme_version_id, service_id) VALUES (?, ?)";
    await assert.rejects(connection.execute(addVersion, [scheme.id, 1, actor]), { code: "ER_DUP_ENTRY" });
    await assert.rejects(connection.execute(addVersion, ["999999", 1, actor]), fkError);
    await assert.rejects(connection.execute(addService, [firstDraft.id, diamondId]), { code: "ER_DUP_ENTRY" });
    await assert.rejects(connection.execute(addService, [firstDraft.id, "999999"]), fkError);
    await assert.rejects(connection.execute(addService, ["999999", diamondId]), fkError);
    await assert.rejects(connection.execute(
      "INSERT INTO scheme_audit_events (scheme_id, scheme_version_id, administrator_id, action) VALUES (25, ?, ?, 'TEST_INVALID')",
      [firstDraft.id, actor],
    ), fkError);

    // SQL-only lifecycle fixture. Admin APIs do not publish.
    await assert.rejects(connection.execute("UPDATE scheme_versions SET status = 'published' WHERE id = ?", [firstDraft.id]),
      { code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await connection.execute("UPDATE scheme_versions SET status = 'published', published_by = ?, published_at = NOW() WHERE id = ?",
      [actor, firstDraft.id]);
    const path = `/${scheme.id}/versions/${firstDraft.id}`;
    assert.equal((await request(path, 200)).status, "published");
    await request(`${path}/services/${diamondId}`, 409, { method: "PUT", body: { status: 0 } });
    await request(`${path}/publish`, 404, { method: "POST" });
    await assert.rejects(connection.execute(addService, [firstDraft.id, diamondId]), immutable);
    await assert.rejects(connection.execute("UPDATE scheme_services SET status = 0 WHERE scheme_version_id = ?", [firstDraft.id]), immutable);
    await assert.rejects(connection.execute("DELETE FROM scheme_services WHERE scheme_version_id = ?", [firstDraft.id]), immutable);
    await assert.rejects(connection.execute("UPDATE scheme_versions SET status = 'draft' WHERE id = ?", [firstDraft.id]), immutable);
    await assert.rejects(connection.execute("DELETE FROM scheme_versions WHERE id = ?", [firstDraft.id]), immutable);

    clone = await request(`${path}/clone`, 201, { method: "POST" });
    assert.equal(clone.versionNumber, 7);
    assert.equal(clone.status, "draft");
    assert.equal(clone.publishedBy, null);
    const cloneLinks = (await request(`/${scheme.id}/versions/${clone.id}/services`, 200)).items;
    assert.deepEqual(cloneLinks.map(({ serviceId, status }) => [serviceId, status]), [[diamondId, 1]]);
    await connection.execute("UPDATE scheme_versions SET status = 'retired' WHERE id = ?", [firstDraft.id]);
    await assert.rejects(connection.execute("UPDATE scheme_versions SET status = 'published' WHERE id = ?", [firstDraft.id]), immutable);
    await assert.rejects(connection.execute("UPDATE scheme_services SET status = 0 WHERE scheme_version_id = ?", [firstDraft.id]), immutable);
  });

  await t.test("records append-only audit history and rolls back mutations when audit insertion fails", async (auditTest) => {
    const [events] = await connection.execute(`
      SELECT CAST(id AS CHAR) AS id, CAST(administrator_id AS CHAR) AS actor, action,
             previous_state AS previousState, new_state AS newState
      FROM scheme_audit_events WHERE scheme_id = ? ORDER BY scheme_audit_events.id
    `, [scheme.id]);
    assert.deepEqual(events.map(({ action }) => action), [
      "SCHEME_CREATED", "DRAFT_CREATED", "SCHEME_METADATA_UPDATED",
      ...Array(5).fill("DRAFT_CREATED"), "DRAFT_SERVICE_CONFIGURED", "DRAFT_CLONED",
    ]);
    assert.ok(events.every((event) => event.actor === actor));
    assert.deepEqual(events[2].previousState, { code: input.code, name: input.name, status: 0, description: "Initial" });
    assert.deepEqual(events[8].newState, { serviceId: diamondId, status: 1 });
    assert.equal(events[9].newState.sourceVersionId, firstDraft.id);
    await assert.rejects(connection.execute("UPDATE scheme_audit_events SET action = 'EDITED' WHERE id = ?", [events[0].id]), immutable);
    await assert.rejects(connection.execute("DELETE FROM scheme_audit_events WHERE id = ?", [events[0].id]), immutable);

    const appendAudit = model.appendAudit;
    auditTest.mock.method(model, "appendAudit", (conn, event) => appendAudit(conn, { ...event, actor: "999999" }));
    const versionPath = `/${scheme.id}/versions`;
    await request(versionPath, 503, { method: "POST" });
    await request(`/${scheme.id}`, 503, { method: "PATCH", body: { description: "Should roll back" } });
    await request(`${versionPath}/${clone.id}/services/${diamondId}`, 503, { method: "PUT", body: { status: 0 } });
    const failedCode = "FAILED-" + suffix;
    await request("", 503, { method: "POST", body: { code: failedCode, name: "Failed " + suffix } });
    assert.equal((await request(versionPath, 200)).pagination.total, 7);
    assert.equal((await request(`/${scheme.id}`, 200)).description, null);
    assert.equal((await request(`${versionPath}/${clone.id}/services`, 200)).items[0].status, 1);
    const [[failed]] = await connection.execute("SELECT COUNT(*) AS total FROM schemes WHERE code = ?", [failedCode]);
    assert.equal(Number(failed.total), 0);
    const [[auditCount]] = await connection.execute("SELECT COUNT(*) AS total FROM scheme_audit_events WHERE scheme_id = ?", [scheme.id]);
    assert.equal(Number(auditCount.total), events.length);
  });
});
