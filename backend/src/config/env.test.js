import assert from "node:assert/strict";
import test from "node:test";
import { getAppConfig, getOtpConfig, getRedisConfig } from "./env.js";

test("application environment uses APP_ENV, then NODE_ENV, then safe development default", () => {
  assert.equal(getAppConfig({}).environment, "development");
  assert.equal(getAppConfig({ NODE_ENV: "test" }).environment, "test");
  assert.equal(getAppConfig({ APP_ENV: "production", NODE_ENV: "development" }).environment, "production");
});

test("development Redis defaults are loopback-only and use the PayTeam namespace", () => {
  assert.deepEqual(getRedisConfig({ APP_ENV: "development" }), {
    host: "127.0.0.1",
    port: 6379,
    password: "",
    keyPrefix: "payteam:development",
    respVersion: 2,
  });
});

test("test and production environments still require an explicit Redis host and PayTeam prefix", () => {
  assert.throws(() => getRedisConfig({ APP_ENV: "test" }), /REDIS_HOST is required/);
  assert.throws(() => getRedisConfig({ APP_ENV: "production", REDIS_HOST: "127.0.0.1" }), /REDIS_KEY_PREFIX is required/);
});

test("KYC OTP secret remains mandatory and has no development fallback", () => {
  assert.throws(() => getOtpConfig({ APP_ENV: "development" }), /KYC_OTP_SECRET is required/);
});
