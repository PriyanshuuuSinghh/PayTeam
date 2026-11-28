import pool from "../../config/db.js";
import ApiError from "../../utils/ApiError.js";

function defaultUnavailable() {
  return new ApiError(503, "Default customer scheme is unavailable", "SERVICE_UNAVAILABLE");
}

async function requireDefaultScheme(connection, { exclusive = false } = {}) {
  const [[row]] = await connection.execute(`
    SELECT CAST(scheme_id AS CHAR) AS id FROM scheme_default
    WHERE singleton_id = 1 ${exclusive ? "FOR UPDATE" : "FOR SHARE"}
  `);
  if (!row) throw defaultUnavailable();
  return row.id;
}

// Administrative resolution uses the active assignment or default in one snapshot.
// Pricing still requires a separately validated published configuration.
async function resolveCustomerScheme(userId, connection = pool) {
  const [[row]] = await connection.execute(`
    SELECT CAST(u.id AS CHAR) AS userId, CAST(u.scheme_id AS CHAR) AS assignedSchemeId,
           assigned.code AS assignedCode, assigned.name AS assignedName, assigned.status AS assignedStatus,
           CAST(fallback.id AS CHAR) AS defaultId, fallback.code AS defaultCode, fallback.name AS defaultName
    FROM users AS u
    LEFT JOIN schemes AS assigned ON assigned.id = u.scheme_id
    LEFT JOIN scheme_default AS setting ON setting.singleton_id = 1
    LEFT JOIN schemes AS fallback ON fallback.id = setting.scheme_id AND fallback.status = 1
    WHERE u.id = CAST(CAST(? AS CHAR) AS UNSIGNED) AND u.role_id = 2
  `, [userId]);
  if (!row) throw new ApiError(404, "Customer not found");
  const assignedScheme = row.assignedSchemeId === null ? null : {
    id: row.assignedSchemeId, code: row.assignedCode, name: row.assignedName, status: row.assignedStatus,
  };
  if (assignedScheme?.status === 1) {
    return { userId: row.userId, assignedScheme, effectiveScheme: assignedScheme, source: "assigned" };
  }
  if (row.defaultId === null) throw defaultUnavailable();
  return {
    userId: row.userId,
    assignedScheme,
    effectiveScheme: { id: row.defaultId, code: row.defaultCode, name: row.defaultName, status: 1 },
    source: "default",
  };
}

export { requireDefaultScheme, resolveCustomerScheme };
