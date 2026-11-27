import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_ENV = "production";
process.env.IDTO_PROVIDER_MODE = "idto";
process.env.IDTO_SKIP_XML_SIGNATURE_VERIFICATION = "false";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "3306";
process.env.DB_NAME = "payteam_route_test";
process.env.DB_USER = "payteam_route_test_user";
process.env.DB_PASSWORD = "payteam-route-test-password";
process.env.JWT_SECRET = "payteam-route-test-jwt-secret-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "1h";

const { default: digilockerRoutes } = await import("../digilocker.routes.js");

test("real production KYC router does not register the mock authorization route", () => {
  const hasMockAuthorizationRoute = digilockerRoutes.stack.some(
    (layer) => layer.route?.path === "/digilocker/mock-authorize",
  );
  assert.equal(hasMockAuthorizationRoute, false);
});
