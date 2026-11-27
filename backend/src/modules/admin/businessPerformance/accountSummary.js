import pool from "../../../config/db.js";

export async function getAccountSummary() {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN u.status = 'active' THEN 1 END) AS active,
            COUNT(CASE WHEN r.slug = 'RT' THEN 1 END) AS retailers,
            EXISTS (SELECT 1 FROM roles WHERE slug = 'RT') AS has_retailer_role,
            COUNT(CASE WHEN k.status = 'approved' THEN 1 END) AS approved,
            COUNT(CASE WHEN k.status = 'rejected' THEN 1 END) AS rejected,
            COUNT(CASE WHEN k.status IN ('submitted', 'under_review') THEN 1 END) AS awaiting_review
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN kyc_cases k ON k.user_id = u.id`,
  );

  return {
    total: Number(row.total),
    active: Number(row.active),
    retailers: Number(row.has_retailer_role) ? Number(row.retailers) : null,
    approved: Number(row.approved),
    rejected: Number(row.rejected),
    awaitingReview: Number(row.awaiting_review),
  };
}
