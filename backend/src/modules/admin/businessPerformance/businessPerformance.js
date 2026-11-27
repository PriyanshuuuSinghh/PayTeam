import pool from "../../../config/db.js";
import ApiError from "../../../utils/ApiError.js";

const hour = 3600;
const day = 24 * hour;
const indiaOffset = 5.5 * hour;
const durations = new Map([["1h", hour], ["24h", day], ["7d", 7 * day], ["30d", 30 * day]]);

function invalidRange() {
  return new ApiError(400, "Invalid Business Performance date range", [], "VALIDATION_ERROR");
}

function indiaMidnight(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalidRange();
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw invalidRange();
  return timestamp / 1000 - indiaOffset;
}

export function getBusinessWindow({ period = "24h", startDate, endDate } = {}, now = Math.floor(Date.now() / 1000)) {
  let end = now;
  let start;
  if (period === "custom") {
    start = indiaMidnight(startDate);
    const finalDay = indiaMidnight(endDate);
    if (finalDay < start || finalDay > now) throw invalidRange();
    end = Math.min(now, finalDay + day);
    if (start >= end) throw invalidRange();
  } else {
    const duration = durations.get(period);
    if (!duration || startDate !== undefined || endDate !== undefined) throw invalidRange();
    start = end - duration;
  }
  return { start, end, previousStart: start - (end - start) };
}

export async function getBusinessPerformance(query) {
  const { start, end, previousStart } = getBusinessWindow(query);
  const [
    [[signups]],
    [[wallets]],
  ] = await Promise.all([
    pool.execute(
      `SELECT COUNT(CASE WHEN UNIX_TIMESTAMP(u.created_at) >= ? THEN 1 END) AS current_count,
              COUNT(CASE WHEN UNIX_TIMESTAMP(u.created_at) < ? THEN 1 END) AS previous_count
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE r.slug = 'US' AND UNIX_TIMESTAMP(u.created_at) >= ? AND UNIX_TIMESTAMP(u.created_at) < ?`,
      [start, start, previousStart, end],
    ),
    pool.execute(
      `SELECT CAST(COALESCE(SUM(w.mainbalance + w.pgbalance + w.qrbalance + w.settlementwallet), 0.00) AS CHAR) AS amount,
              COUNT(*) - COUNT(w.user_id) AS missing_wallets
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN user_wallets w ON w.user_id = u.id
        WHERE r.slug = 'US'`,
    ),
  ]);

  const current = Number(signups.current_count);
  const previous = Number(signups.previous_count);
  return {
    window: { start, end },
    signups: { current, previous, changePercent: previous === 0 ? null : (current - previous) / previous * 100 },
    walletBalance: { amount: Number(wallets.missing_wallets) === 0 ? wallets.amount : null, currency: "INR" },
  };
}
