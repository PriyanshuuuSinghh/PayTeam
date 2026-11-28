import pool from "../../config/db.js";

const SERVICE_FIELDS = `
  CAST(id AS CHAR) AS id, code, name, description, status,
  display_order AS displayOrder
`;
const OPERATOR_FIELDS = "CAST(id AS CHAR) AS id, code, name, operator_type AS operatorType, status";
// Bind as text first so MySQL does not infer a signed integer for the parameter.
const UNSIGNED_ID_PARAMETER = "CAST(CAST(? AS CHAR) AS UNSIGNED)";

async function listRows({ fields, source, conditions, parameters, orderBy }, { limit, offset }) {
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM ${source} ${where}`, parameters);
  const [items] = await pool.execute(
    `SELECT ${fields} FROM ${source} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...parameters, limit, offset],
  );
  return { items, pagination: { limit, offset, total: Number(count.total) } };
}

function listServices(options) {
  return listRows({
    fields: SERVICE_FIELDS,
    source: "services",
    conditions: options.status === undefined ? [] : ["status = ?"],
    parameters: options.status === undefined ? [] : [options.status],
    orderBy: "display_order ASC, id ASC",
  }, options);
}

async function findService(id) {
  const [[service]] = await pool.execute(
    `SELECT ${SERVICE_FIELDS} FROM services WHERE id = ${UNSIGNED_ID_PARAMETER}`,
    [id],
  );
  return service ?? null;
}

function listOperators(options) {
  return listRows({
    fields: OPERATOR_FIELDS,
    source: "operators",
    conditions: options.status === undefined ? [] : ["status = ?"],
    parameters: options.status === undefined ? [] : [options.status],
    orderBy: "code ASC, id ASC",
  }, options);
}

function listServiceOperators(serviceId, options) {
  const conditions = [`mapping.service_id = ${UNSIGNED_ID_PARAMETER}`];
  const parameters = [serviceId];
  if (options.status !== undefined) {
    conditions.push("mapping.status = ?");
    parameters.push(options.status);
  }
  return listRows({
    fields: `
      CAST(mapping.id AS CHAR) AS id, CAST(mapping.service_id AS CHAR) AS serviceId,
      CAST(operator.id AS CHAR) AS operatorId, operator.code, operator.name,
      operator.operator_type AS operatorType, operator.status AS operatorStatus,
      mapping.status, mapping.display_order AS displayOrder
    `,
    source: "service_operators AS mapping JOIN operators AS operator ON operator.id = mapping.operator_id",
    conditions,
    parameters,
    orderBy: "mapping.display_order ASC, mapping.id ASC",
  }, options);
}

export default { listServices, findService, listOperators, listServiceOperators };
