import ApiError from "../../utils/ApiError.js";

const MAX_ID = 18446744073709551615n;

function parseId(value, label) {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > MAX_ID) {
    throw new ApiError(400, `Invalid ${label} identifier`);
  }
  return value;
}

function parsePagination(query) {
  const { limit = "50", offset = "0" } = query;
  if (Object.keys(query).some((key) => !["limit", "offset"].includes(key)) ||
      typeof limit !== "string" || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100 ||
      typeof offset !== "string" || !/^(0|[1-9]\d{0,5})$/.test(offset) || Number(offset) > 100000) {
    throw new ApiError(400, "Invalid pagination parameters");
  }
  return { limit: Number(limit), offset: Number(offset) };
}

function requireFields(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, "Invalid scheme fields");
  }
}

function parseMetadata(body) {
  const metadata = {};
  if (Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || [...body.name.trim()].length > 150) {
      throw new ApiError(400, "Name must contain 1 to 150 characters");
    }
    metadata.name = body.name.trim();
  }
  if (Object.hasOwn(body, "description")) {
    if (body.description !== null && (typeof body.description !== "string" || [...body.description.trim()].length > 500)) {
      throw new ApiError(400, "Description must be null or up to 500 characters");
    }
    metadata.description = body.description?.trim() || null;
  }
  return metadata;
}

function parseCreate(body) {
  requireFields(body, ["code", "name", "description"]);
  if (typeof body.code !== "string" || !/^[A-Z][A-Z0-9_-]{0,39}$/.test(body.code) || body.code.startsWith("LEGACY-")) {
    throw new ApiError(400, "Enter a valid uppercase scheme code outside the LEGACY- namespace");
  }
  const metadata = parseMetadata(body);
  if (!metadata.name) throw new ApiError(400, "Name is required");
  return { code: body.code, name: metadata.name, description: metadata.description ?? null };
}

function parseUpdate(body) {
  requireFields(body, ["name", "description"]);
  return parseMetadata(body);
}

function parseConfiguration(body) {
  requireFields(body, ["status"]);
  if (body.status !== 0 && body.status !== 1) throw new ApiError(400, "Status must be 0 or 1");
  return body.status;
}

function validateEmptyAction(body) {
  if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) {
    throw new ApiError(400, "This action does not accept fields");
  }
}

export { parseId, parsePagination, parseCreate, parseUpdate, parseConfiguration, validateEmptyAction };
