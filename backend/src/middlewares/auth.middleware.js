
import jwt from "jsonwebtoken";
import authModel from "../modules/auth/auth.model.js";
import ApiError from "../utils/ApiError.js";
import { getAuthConfig, JWT_ISSUER, JWT_AUDIENCE } from "../config/auth.js";

function unauthorized(message = "Authentication required") {
  return new ApiError(401, message, [], "UNAUTHORIZED");
}

function forbidden(message = "Admin access required") {
  return new ApiError(403, message, [], "FORBIDDEN");
}

async function authenticate(req, res, next, adminOnly) {
  const header = req.get("authorization");
  const match =
    typeof header === "string"
      ? header.match(/^Bearer\s+(\S+)$/i)
      : null;

  if (!match) return next(unauthorized());

  let payload;

  try {
    payload = jwt.verify(match[1], getAuthConfig().secret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    return next(unauthorized("Invalid or expired access token"));
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !/^[1-9]\d*$/.test(payload.sub) ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return next(unauthorized("Invalid or expired access token"));
  }

  try {
    const access = adminOnly
      ? await authModel.getAdminAccess(payload.sub)
      : (await authModel.isUserActive(payload.sub) ? "active" : "inactive");
    if (access === "inactive") {
      return next(unauthorized("Invalid or expired access token"));
    }
    if (adminOnly && access !== "admin") return next(forbidden());
  } catch {
    return next(
      new ApiError(
        503,
        "Authentication is temporarily unavailable",
        [],
        "SERVICE_UNAVAILABLE",
      ),
    );
  }

  req.user = { id: payload.sub };
  return next();
}

function requireAuth(req, res, next) {
  return authenticate(req, res, next, false);
}

// Read-only dashboard routes can verify the active account and its admin role
// together. Other routes keep their existing middleware and authorization.
function requireActiveAdmin(req, res, next) {
  return authenticate(req, res, next, true);
}

async function requireAdmin(req, res, next) {
  if (!req.user?.id) {
    return next(unauthorized());
  }

  try {
    const isAdmin = await authModel.isAdmin(req.user.id);

    if (!isAdmin) {
      return next(forbidden());
    }

    return next();
  } catch {
    return next(
      new ApiError(
        503,
        "Authorization is temporarily unavailable",
        [],
        "SERVICE_UNAVAILABLE",
      ),
    );
  }
}

const authMiddleware = {
  requireAuth,
  requireAdmin,
};

export { requireAuth, requireAdmin, requireActiveAdmin };
export default authMiddleware;
