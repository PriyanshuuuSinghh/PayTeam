import ApiError from "../../utils/ApiError.js";

const MAX_SERVICE_ID = 18446744073709551615n;

function parseServiceId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > MAX_SERVICE_ID) {
    throw new ApiError(400, "Invalid service identifier");
  }
  return value;
}

function parseListOptions(query) {
  const { status, limit = "50", offset = "0" } = query;
  if (Object.keys(query).some((key) => !["status", "limit", "offset"].includes(key))) {
    throw new ApiError(400, "Unsupported catalogue query parameter");
  }
  if (status !== undefined && status !== "0" && status !== "1") {
    throw new ApiError(400, "Status must be 0 or 1");
  }
  if (typeof limit !== "string" || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100) {
    throw new ApiError(400, "Limit must be between 1 and 100");
  }
  if (typeof offset !== "string" || !/^(0|[1-9]\d{0,5})$/.test(offset) || Number(offset) > 100000) {
    throw new ApiError(400, "Offset must be between 0 and 100000");
  }
  return { status: status === undefined ? undefined : Number(status), limit: Number(limit), offset: Number(offset) };
}

export { parseServiceId, parseListOptions };
