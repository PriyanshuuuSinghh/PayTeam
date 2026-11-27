import { fileURLToPath } from "url";

import pool, { getDatabaseConfig, verifyDatabaseConnection } from "./config/db.js";
import redisConnection from "./config/redis.js";
import { getAuthConfig } from "./config/auth.js";
import { getAppConfig, getOtpConfig, getRedisConfig, validateProductionIntegrations } from "./config/env.js";
import { assertDigiLockerSignaturePolicy } from "./modules/kyc/document-verification/digilocker/digilocker.signatureConfig.js";
import { assertIdentityEncryptionConfiguration } from "./modules/kyc/document-verification/shared/identityData.crypto.js";
import { assertProviderSessionEncryptionConfiguration } from "./modules/kyc/document-verification/shared/providerSession.crypto.js";
import { assertBankAccountEncryptionConfiguration } from "./modules/kyc/bank-details/bankAccountEncryption.js";

async function start() {
  try {
    const appConfig = getAppConfig();
    const signaturePolicy = assertDigiLockerSignaturePolicy(process.env);
    getDatabaseConfig();
    getRedisConfig();
    getOtpConfig();
    validateProductionIntegrations();

    assertIdentityEncryptionConfiguration(process.env);
    assertProviderSessionEncryptionConfiguration();
    assertBankAccountEncryptionConfiguration();

    // Validate auth configuration early
    getAuthConfig();

    // Load routes only after dotenv has populated the environment. DigiLocker selects
    // its real or mock provider and registers the mock-only route during module load.
    const { default: app } = await import("./app.js");

    // Verify DB connection before starting server
    await verifyDatabaseConnection();
    const { default: digilockerModel } = await import("./modules/kyc/document-verification/digilocker/digilocker.model.js");
    await digilockerModel.assertSessionSchema();
    await digilockerModel.assertNoDevelopmentUnverifiedRecords();
    const port = appConfig.port;

    const { default: digilockerProvider } = await import("./modules/kyc/document-verification/digilocker/digilocker.provider.js");
    console.info(
      `${appConfig.name} DigiLocker provider: ${digilockerProvider.mode}; Aadhaar XML signatures are not verified; PAN XML signature policy: ${signaturePolicy.mode}`,
    );
    if (signaturePolicy.developmentOnly) {
      console.warn("PAN XML verification results will be marked development-only and cryptographically unverified");
    }

    const server = app.listen(port, () => {
      console.log(
        `${appConfig.name} API listening on port ${port}; database connection verified`,
      );
    });

    return server;
  } catch (error) {
    console.error(`${process.env.APP_NAME || "PayTeam"} startup failed:`, error.message);
    // Ensure pool is closed if it was created
    await pool.end().catch(() => {});
    process.exitCode = 1;
    return null;
  }
}

function installGracefulShutdown(server) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`${process.env.APP_NAME || "PayTeam"} received ${signal}; shutting down`);
    server.close(async (serverError) => {
      const results = await Promise.allSettled([
        pool.end(),
        redisConnection.closeRedisConnection(),
      ]);
      if (serverError || results.some((result) => result.status === "rejected")) {
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

// Start server only when this file is executed directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().then((server) => {
    if (server) installGracefulShutdown(server);
  });
}

export { start, installGracefulShutdown };
export default { start, installGracefulShutdown };
