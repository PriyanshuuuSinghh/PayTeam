import crypto from "node:crypto";

const TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_RESENDS = 3;

// The scripts retain the original TTL and make verification / replacement atomic.
const VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0} end
local challenge = cjson.decode(raw)
if challenge.tokenHash ~= ARGV[1] then return {0} end
if challenge.otpHash == ARGV[2] then
  redis.call('DEL', KEYS[1])
  return {1, challenge.passwordBinding}
end
challenge.attempts = challenge.attempts + 1
if challenge.attempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
end
return {0}
`;
const RESEND_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0} end
local challenge = cjson.decode(raw)
if challenge.tokenHash ~= ARGV[1] or challenge.passwordBinding ~= ARGV[2] then return {0} end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return {0} end
local now = tonumber(redis.call('TIME')[1])
if now - challenge.sentAt < tonumber(ARGV[4]) or challenge.resends >= tonumber(ARGV[5]) then return {2} end
challenge.otpHash = ARGV[3]
challenge.sentAt = now
challenge.resends = challenge.resends + 1
redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
return {1, ttl}
`;

function createLoginOtpStore({ getClient, keyPrefix, secret, now = () => Date.now(), randomInt = crypto.randomInt }) {
  function hmac(purpose, value) {
    return crypto.createHmac("sha256", secret).update(`payteam:login:${purpose}:${value}`).digest("hex");
  }
  function parseToken(loginToken) {
    const match = typeof loginToken === "string" && /^([1-9]\d{0,19})\.([A-Za-z0-9_-]{43})$/.exec(loginToken);
    return match ? { userId: match[1], tokenHash: hmac("token", loginToken) } : null;
  }
  function key(userId) { return `${keyPrefix}:auth:login:${userId}`; }
  function bindPassword(userId, passwordHash) { return hmac("password-binding", `${userId}:${passwordHash}`); }
  function generateOtp() { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
  async function issue(user) {
    const userId = String(user.id);
    const loginToken = `${userId}.${crypto.randomBytes(32).toString("base64url")}`;
    const { tokenHash } = parseToken(loginToken);
    const otp = generateOtp();
    const client = await getClient();
    await client.set(key(userId), JSON.stringify({
      tokenHash, otpHash: hmac("otp", `${loginToken}:${otp}`),
      passwordBinding: bindPassword(userId, user.password_hash),
      attempts: 0, resends: 0, sentAt: Math.floor(now() / 1000),
    }), { EX: TTL_SECONDS });
    return { loginToken, otp, expiresIn: TTL_SECONDS };
  }
  async function verify(loginToken, otp) {
    const parsed = parseToken(loginToken);
    if (!parsed) return null;
    const client = await getClient();
    const result = await client.eval(VERIFY_SCRIPT, {
      keys: [key(parsed.userId)],
      arguments: [parsed.tokenHash, hmac("otp", `${loginToken}:${otp}`), String(MAX_ATTEMPTS)],
    });
    return Number(result[0]) === 1 ? { userId: parsed.userId, passwordBinding: result[1] } : null;
  }
  async function resend(loginToken, user) {
    const parsed = parseToken(loginToken);
    if (!parsed || parsed.userId !== String(user.id)) return null;
    const otp = generateOtp();
    const client = await getClient();
    const result = await client.eval(RESEND_SCRIPT, {
      keys: [key(parsed.userId)],
      arguments: [parsed.tokenHash, bindPassword(parsed.userId, user.password_hash), hmac("otp", `${loginToken}:${otp}`), String(RESEND_COOLDOWN_SECONDS), String(MAX_RESENDS)],
    });
    if (Number(result[0]) === 2) return { rateLimited: true };
    return Number(result[0]) === 1 ? { loginToken, otp, expiresIn: Number(result[1]) } : null;
  }
  function matchesPassword(user, passwordBinding) {
    const expected = bindPassword(String(user.id), user.password_hash);
    return typeof passwordBinding === "string" && /^[a-f0-9]{64}$/.test(passwordBinding) && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(passwordBinding, "hex"));
  }
  return { issue, verify, resend, parseToken, matchesPassword };
}

export { createLoginOtpStore, TTL_SECONDS, MAX_ATTEMPTS, RESEND_COOLDOWN_SECONDS };
