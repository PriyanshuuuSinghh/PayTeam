import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../..");

// Always load this application's backend/.env, independent of the shell cwd.
dotenv.config({ path: path.join(backendRoot, ".env") });

const VALID_APP_ENVS = new Set(["development", "test", "production"]);

function requiredString(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function positiveInteger(env, name, fallback, min, max = 10000) {
  const raw = env[name] === undefined || env[name] === "" ? String(fallback) : String(env[name]);
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function getAppConfig(env = process.env) {
  const appName = env.APP_NAME?.trim() || "PayTeam";
  const appEnv = requiredString(env, "APP_ENV");
  if (!VALID_APP_ENVS.has(appEnv)) {
    throw new Error("APP_ENV must be development, test, or production");
  }
  return Object.freeze({
    name: appName,
    environment: appEnv,
    port: positiveInteger(env, "APP_PORT", 3000, 1, 65535),
  });
}

function assertPayTeamDatabaseName(databaseName) {
  if (!/^payteam_[A-Za-z0-9_]+$/.test(String(databaseName || ""))) {
    throw new Error("DB_NAME must identify a PayTeam database (payteam_*)");
  }
  return databaseName;
}

function getRedisConfig(env = process.env) {
  const { environment } = getAppConfig(env);
  const host = requiredString(env, "REDIS_HOST");
  const port = positiveInteger(env, "REDIS_PORT", 6379, 1, 65535);
  const keyPrefix = requiredString(env, "REDIS_KEY_PREFIX");
  if (!/^payteam:[A-Za-z0-9:_-]+$/.test(keyPrefix)) {
    throw new Error("REDIS_KEY_PREFIX must start with payteam:");
  }
  const password = env.REDIS_PASSWORD?.trim() || "";
  if (environment === "production" && !password) {
    throw new Error("REDIS_PASSWORD is required in production");
  }
  const respVersion = env.REDIS_RESP_VERSION === undefined || env.REDIS_RESP_VERSION === ""
    ? 2
    : Number(env.REDIS_RESP_VERSION);
  if (![2, 3].includes(respVersion)) throw new Error("REDIS_RESP_VERSION must be 2 or 3");
  return Object.freeze({ host, port, password, keyPrefix, respVersion });
}

function getOtpConfig(env = process.env) {
  const secret = requiredString(env, "KYC_OTP_SECRET");
  if (secret.length < 32 || /replace|example|placeholder/i.test(secret)) {
    throw new Error("KYC_OTP_SECRET must be a unique value of at least 32 characters");
  }
  return Object.freeze({
    secret,
    expirySeconds: positiveInteger(env, "OTP_EXPIRY", 300, 60, 900),
    maxAttempts: positiveInteger(env, "OTP_MAX_ATTEMPTS", 5, 1, 10),
  });
}

function validateProductionIntegrations(env = process.env) {
  if (getAppConfig(env).environment !== "production") return true;

  const allowedOrigins = (env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (allowedOrigins.length === 0 || allowedOrigins.some((origin) => !origin.startsWith("https://"))) {
    throw new Error("CORS_ORIGINS must contain the HTTPS PayTeam frontend origins in production");
  }

  for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
    requiredString(env, name);
  }

  if ((env.IDTO_PROVIDER_MODE?.trim() || "idto") === "idto") {
    for (const name of ["IDTO_BASE_URL", "IDTO_CLIENT_ID", "IDTO_API_KEY", "IDTO_REDIRECT_URL"]) {
      requiredString(env, name);
    }
    const baseUrl = new URL(env.IDTO_BASE_URL);
    const redirectUrl = new URL(env.IDTO_REDIRECT_URL);
    if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "prod.idto.ai" || redirectUrl.protocol !== "https:") {
      throw new Error("Production IDTO and callback URLs must use the approved HTTPS endpoints");
    }
  }

  return true;
}

export {
  assertPayTeamDatabaseName,
  backendRoot,
  getAppConfig,
  getOtpConfig,
  getRedisConfig,
  positiveInteger,
  requiredString,
  validateProductionIntegrations,
};
