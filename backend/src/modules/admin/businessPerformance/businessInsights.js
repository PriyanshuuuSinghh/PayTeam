import pool from "../../../config/db.js";
import { STEP_NAMES } from "../../kyc/submission/submission.service.js";
import { getBusinessWindow } from "./businessPerformance.js";

export async function getBusinessInsights(query) {
  const { start, end } = getBusinessWindow(query);
  const [[cohort], [[customers]]] = await Promise.all([
    pool.execute(
      `SELECT case_progress.completed_mask, COUNT(*) AS case_count,
              COUNT(CASE WHEN case_progress.status = 'approved' THEN 1 END) AS approved_count
         FROM (
           SELECT kc.id, kc.status, BIT_OR(1 << (ks.step_number - 1)) AS completed_mask
             FROM kyc_cases kc
             JOIN users u ON u.id = kc.user_id
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN kyc_steps ks ON ks.case_id = kc.id AND ks.status = 'completed'
            WHERE r.slug = 'US'
              AND UNIX_TIMESTAMP(kc.created_at) >= ?
              AND UNIX_TIMESTAMP(kc.created_at) < ?
            GROUP BY kc.id, kc.status
         ) AS case_progress
        GROUP BY case_progress.completed_mask`,
      [start, end],
    ),
    pool.execute(
      `SELECT COUNT(*) AS total_customers,
              COUNT(CASE WHEN u.status = 'active' THEN 1 END) AS active_customers
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE r.slug = 'US'`,
    ),
  ]);

  const totalCases = cohort.reduce((total, row) => total + Number(row.case_count), 0);
  const approvedCases = cohort.reduce((total, row) => total + Number(row.approved_count), 0);
  const steps = Object.entries(STEP_NAMES).map(([number, label]) => {
    const step = Number(number);
    const requiredMask = (1 << step) - 1;
    const completed = cohort.reduce((count, row) =>
      (Number(row.completed_mask) & requiredMask) === requiredMask ? count + Number(row.case_count) : count, 0);
    return { step, label, completed };
  });

  return {
    window: { start, end },
    kycFunnel: { totalCases, approvedCases, steps },
    activeCustomers: Number(customers.active_customers),
    totalCustomers: Number(customers.total_customers),
  };
}
