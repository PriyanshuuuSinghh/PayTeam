import pool from "../../config/db.js";

const ID = "CAST(CAST(? AS CHAR) AS UNSIGNED)";
  const SCHEME_FIELDS = `
    CAST(id AS CHAR) AS id, code, name, description, status,
  EXISTS(SELECT 1 FROM scheme_default WHERE singleton_id = 1 AND scheme_id = schemes.id) AS isDefault,
    CAST(created_by AS CHAR) AS createdBy, CAST(updated_by AS CHAR) AS updatedBy,
    created_at AS createdAt, updated_at AS updatedAt
  `;
const VERSION_FIELDS = `
  CAST(id AS CHAR) AS id, CAST(scheme_id AS CHAR) AS schemeId, version_number AS versionNumber, status,
  CAST(created_by AS CHAR) AS createdBy, CAST(published_by AS CHAR) AS publishedBy,
  published_at AS publishedAt, created_at AS createdAt, updated_at AS updatedAt
`;
const SERVICE_FIELDS = `
  CAST(link.id AS CHAR) AS id, CAST(link.service_id AS CHAR) AS serviceId,
  service.code, service.name, service.status AS catalogueStatus, link.status,
  link.created_at AS createdAt, link.updated_at AS updatedAt
`;
const SERVICE_FROM = `
  FROM scheme_services AS link JOIN services AS service ON service.id = link.service_id
  WHERE link.scheme_version_id = ${ID}
`;

async function first(connection, sql, params) {
  const [[row]] = await connection.execute(sql, params);
  return row ?? null;
}

async function list(fields, from, params, order, { limit, offset }) {
  const { total } = await first(pool, `SELECT COUNT(*) AS total ${from}`, params);
  const [items] = await pool.execute(
    `SELECT ${fields} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset],
  );
  return { items, pagination: { limit, offset, total: Number(total) } };
}

function listSchemes(pagination) {
  return list(SCHEME_FIELDS, "FROM schemes", [], "schemes.id ASC", pagination);
}

function listAssignmentOptions(pagination) {
  return list(SCHEME_FIELDS, "FROM schemes WHERE status = 1", [], "schemes.id ASC", pagination);
}

function findAssignmentTarget(connection, schemeId) {
  return first(connection, `SELECT status FROM schemes WHERE id = ${ID} FOR SHARE`, [schemeId]);
}

function findCustomer(id) {
  return first(pool, `SELECT 1 AS found FROM users WHERE id = ${ID} AND role_id = 2`, [id]);
}

async function lockCustomers(connection, customerIds) {
  const [rows] = await connection.execute(`
    SELECT CAST(u.id AS CHAR) AS id, CAST(u.scheme_id AS CHAR) AS schemeId, u.status
    FROM users AS u WHERE u.id IN (${customerIds.map(() => ID).join(", ")}) AND u.role_id = 2
    ORDER BY u.id FOR UPDATE
  `, customerIds);
  return rows;
}

async function saveAssignments(connection, customers, schemeId, actor) {
  const ids = customers.map(({ id }) => id);
  const [result] = await connection.execute(`
    UPDATE users SET scheme_id = ${ID} WHERE id IN (${ids.map(() => ID).join(", ")})
  `, [schemeId, ...ids]);
  if (result.affectedRows !== ids.length) throw new Error("Scheme assignment row count changed");
  await connection.execute(`
    INSERT INTO scheme_assignment_history (customer_id, previous_scheme_id, new_scheme_id, administrator_id)
    VALUES ${ids.map(() => `(${ID}, ${ID}, ${ID}, ${ID})`).join(", ")}
  `, customers.flatMap((customer) => [customer.id, customer.schemeId, schemeId, actor]));
}

async function listAssignmentHistory(customerId, pagination) {
  const page = await list(`
    CAST(id AS CHAR) AS id, CAST(previous_scheme_id AS CHAR) AS previousSchemeId,
    CAST(new_scheme_id AS CHAR) AS newSchemeId, CAST(administrator_id AS CHAR) AS administratorId,
    UNIX_TIMESTAMP(created_at) AS createdAt
  `, `FROM scheme_assignment_history WHERE customer_id = ${ID}`, [customerId],
  "scheme_assignment_history.id DESC", pagination);
  return {
    ...page,
    items: page.items.map((item) => ({ ...item, createdAt: new Date(Number(item.createdAt) * 1000).toISOString() })),
  };
}

function listVersions(schemeId, pagination) {
  return list(VERSION_FIELDS, `FROM scheme_versions WHERE scheme_id = ${ID}`, [schemeId], "version_number DESC", pagination);
}

function listServices(versionId, pagination) {
  return list(SERVICE_FIELDS, SERVICE_FROM, [versionId], "service.display_order ASC, link.service_id ASC", pagination);
}

function findScheme(id, connection = pool, lock = false) {
  return first(connection, `SELECT ${SCHEME_FIELDS} FROM schemes WHERE id = ${ID}${lock ? " FOR UPDATE" : ""}`, [id]);
}

function findVersion(schemeId, versionId, connection = pool, lock = false) {
  return first(connection, `SELECT ${VERSION_FIELDS} FROM scheme_versions
    WHERE scheme_id = ${ID} AND id = ${ID}${lock ? " FOR UPDATE" : ""}`, [schemeId, versionId]);
}

async function insertScheme(connection, { code, name, description }, actor) {
  await connection.execute(`INSERT INTO schemes (code, name, description, status, created_by, updated_by)
    VALUES (?, ?, ?, 0, ${ID}, ${ID})`, [code, name, description, actor, actor]);
  const { id } = await first(connection, "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id");
  return findScheme(id, connection);
}

async function updateScheme(connection, id, { name, description }, actor) {
  await connection.execute(`UPDATE schemes SET name = ?, description = ?, updated_by = ${ID} WHERE id = ${ID}`,
    [name, description, actor, id]);
  return findScheme(id, connection);
}

async function updateSchemeStatus(connection, id, status, actor) {
  await connection.execute(`UPDATE schemes SET status = ?, updated_by = ${ID} WHERE id = ${ID}`, [status, actor, id]);
  return findScheme(id, connection);
}

async function updateDefault(connection, schemeId) {
  await connection.execute(`UPDATE scheme_default SET scheme_id = ${ID} WHERE singleton_id = 1`, [schemeId]);
}

// The caller holds the parent scheme row lock before allocating a number.
async function insertDraft(connection, schemeId, actor) {
  const { lastNumber } = await first(connection, `SELECT COALESCE(MAX(version_number), 0) AS lastNumber
    FROM scheme_versions WHERE scheme_id = ${ID}`, [schemeId]);
  await connection.execute(`INSERT INTO scheme_versions (scheme_id, version_number, created_by)
    VALUES (${ID}, ?, ${ID})`, [schemeId, Number(lastNumber) + 1, actor]);
  const { id } = await first(connection, "SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id");
  return findVersion(schemeId, id, connection);
}

async function initializeServices(connection, versionId, sourceVersionId) {
  if (sourceVersionId) {
    await connection.execute(`INSERT INTO scheme_services (scheme_version_id, service_id, status)
      SELECT ${ID}, service_id, status FROM scheme_services WHERE scheme_version_id = ${ID}`,
    [versionId, sourceVersionId]);
  } else {
    await connection.execute(`INSERT INTO scheme_services (scheme_version_id, service_id)
      SELECT ${ID}, id FROM services WHERE status = 1`, [versionId]);
  }
}

function findMasterService(connection, serviceId) {
  return first(connection, `SELECT status FROM services WHERE id = ${ID} FOR SHARE`, [serviceId]);
}

function findLinkedService(connection, versionId, serviceId) {
  return first(connection, `SELECT ${SERVICE_FIELDS} ${SERVICE_FROM} AND link.service_id = ${ID}`, [versionId, serviceId]);
}

async function saveLinkedService(connection, versionId, serviceId, status, exists) {
  if (exists) {
    await connection.execute(`UPDATE scheme_services SET status = ?
      WHERE scheme_version_id = ${ID} AND service_id = ${ID}`, [status, versionId, serviceId]);
  } else {
    await connection.execute(`INSERT INTO scheme_services (scheme_version_id, service_id, status)
      VALUES (${ID}, ${ID}, ?)`, [versionId, serviceId, status]);
  }
  return findLinkedService(connection, versionId, serviceId);
}

async function appendAudit(connection, { schemeId, versionId = null, actor, action, before = null, after }) {
  await connection.execute(`INSERT INTO scheme_audit_events
      (scheme_id, scheme_version_id, administrator_id, action, previous_state, new_state)
      VALUES (${ID}, ${ID}, ${ID}, ?, ?, ?)`, [
    schemeId, versionId, actor, action, before === null ? null : JSON.stringify(before), JSON.stringify(after),
  ]);
}

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      connection.destroy();
    }
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  listSchemes, listVersions, listServices, findScheme, findVersion, insertScheme, updateScheme, updateSchemeStatus, updateDefault, insertDraft,
  initializeServices, findMasterService, findLinkedService, saveLinkedService, appendAudit, transaction,
  listAssignmentOptions, findAssignmentTarget, findCustomer, lockCustomers, saveAssignments, listAssignmentHistory,
};
