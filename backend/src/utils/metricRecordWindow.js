import ApiError from "./ApiError.js";

export function parseMetricRecordWindow(from, to) {
  if (typeof from !== "string" || typeof to !== "string" ||
      !/^-?\d{1,12}$/.test(from) || !/^-?\d{1,12}$/.test(to) ||
      Number(from) >= Number(to) || Number(to) > Math.floor(Date.now() / 1000) + 60) {
    throw new ApiError(400, "Invalid metric record window", [], "VALIDATION_ERROR");
  }
  return { start: Number(from), end: Number(to) };
}
