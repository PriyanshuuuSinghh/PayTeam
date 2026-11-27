import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoginOtpStore, TTL_SECONDS, MAX_ATTEMPTS } from "./loginOtpStore.js";

function fakeClient() {
  const calls = [];
  let response = [0];
  return {
    calls,
    respond(value) { response = value; },
    async set(...args) { calls.push({ method: "set", args }); return "OK"; },
    async eval(...args) { calls.push({ method: "eval", args }); return response; },
  };
}
const account = { id: 42, password_hash: "test-password-hash" };
function fixture() {
  const client = fakeClient();
  const store = createLoginOtpStore({ getClient: async () => client, keyPrefix: "payteam:test", secret: "unit-test-secret", now: () => 100000, randomInt: () => 123 });
  return { client, store };
}

test("OTP issue stores only HMACs, scoped by user and with five-minute expiration", async () => {
  const { client, store } = fixture();
  const challenge = await store.issue(account);
  assert.match(challenge.loginToken, /^42\.[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge.otp, "000123");
  assert.equal(challenge.expiresIn, TTL_SECONDS);
  const [key, value, options] = client.calls[0].args;
  assert.equal(key, "payteam:test:auth:login:42");
  assert.deepEqual(options, { EX: 300 });
  const record = JSON.parse(value);
  assert.equal(record.attempts, 0);
  assert.equal(record.resends, 0);
  for (const key of ["otpHash", "tokenHash", "passwordBinding"]) assert.match(record[key], /^[a-f0-9]{64}$/);
  assert.ok(!value.includes(challenge.loginToken) && !value.includes(account.password_hash));
  assert.ok(!Object.hasOwn(record, "otp"));
  assert.ok(store.matchesPassword(account, record.passwordBinding));
  assert.ok(!store.matchesPassword({ ...account, password_hash: "changed" }, record.passwordBinding));
});

test("OTP verify invokes one atomic script with HMACs and attempt limit; rejects failure", async () => {
  const { client, store } = fixture();
  const challenge = await store.issue(account);
  const record = JSON.parse(client.calls[0].args[1]);
  client.respond([1, record.passwordBinding]);
  assert.deepEqual(await store.verify(challenge.loginToken, challenge.otp), { userId: "42", passwordBinding: record.passwordBinding });
  const [script, options] = client.calls[1].args;
  assert.match(script, /redis.call\('DEL'/);
  assert.match(script, /KEEPTTL/);
  assert.deepEqual(options.arguments, [record.tokenHash, record.otpHash, String(MAX_ATTEMPTS)]);
  client.respond([0]);
  assert.equal(await store.verify(challenge.loginToken, "000000"), null);
  const count = client.calls.length;
  assert.equal(await store.verify("invalid", "000000"), null);
  assert.equal(client.calls.length, count);
});

test("resend retains the challenge lifetime and handles cooldown and invalid challenges", async () => {
  const { client, store } = fixture();
  const challenge = await store.issue(account);
  client.respond([1, 250]);
  assert.equal((await store.resend(challenge.loginToken, account)).expiresIn, 250);
  const [script, options] = client.calls[1].args;
  assert.match(script, /KEEPTTL/);
  assert.match(script, /challenge.resends/);
  assert.equal(options.arguments[3], "30");
  assert.equal(options.arguments[4], "3");
  client.respond([2]);
  assert.deepEqual(await store.resend(challenge.loginToken, account), { rateLimited: true });
  client.respond([0]);
  assert.equal(await store.resend(challenge.loginToken, account), null);
  assert.equal(await store.resend(challenge.loginToken, { ...account, id: 43 }), null);
});
