import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

const steps = ["aadhaar", "pan", "bank", "media"];
const validVersion = v => typeof v === "string" && /^[A-Za-z0-9._-]{1,50}$/.test(v);
const validText = v => typeof v === "string" && v.trim().length >= 20 && v.length <= 40000;

// Built-in notices for explicitly authorized live-provider development testing only.
// These are not production terms or a substitute for a reviewed retention policy.
export const DEVELOPMENT_AGREEMENT_CODE = "PAYTEAM_DEVELOPMENT_KYC_ACKNOWLEDGEMENT";
const developmentDocument = Object.freeze({
  version: "dev-v1",
  disclosures: Object.freeze({
    aadhaar: "Development test: I authorize PayTeam to retrieve my Aadhaar identity details through IDTO and DigiLocker and use them to verify my identity and update my registered name.",
    pan: "Development test: I authorize PayTeam to verify my PAN through IDTO and compare the returned name with my verified Aadhaar name.",
    bank: "Development test: I authorize PayTeam to send my account number and IFSC to IDTO for bank verification and store the verification result.",
    media: "Development test: I authorize PayTeam to collect my selfie, shop photo and recorded video with audio and store them using authenticated Cloudinary uploads for KYC review.",
  }),
  mediaRetention: "Uploaded media is stored in the configured Cloudinary account. Automatic deletion is not implemented; authorized test operators must manage retention and cleanup. Do not submit another person's documents or images.",
  videoConsentScript: "I am participating in an authorized PayTeam development KYC test. I consent to this recording and confirm that the information I have supplied is my own.",
  agreement: Object.freeze({
    code: DEVELOPMENT_AGREEMENT_CODE,
    version: "dev-v1",
    title: "PayTeam development KYC acknowledgement",
    content: "I confirm that I am an authorized test participant, that the identity and bank details I submitted are my own, and that I consent to the information and media being reviewed for this development test. I understand that this is a test acknowledgement, not a production customer agreement, and that submission does not authorize payments or financial services.",
  }),
});

function verifyCertificate(path) {
  const certificate = new X509Certificate(readFileSync(path));
  if (certificate.publicKey.asymmetricKeyType !== "rsa" || Date.now() < Date.parse(certificate.validFrom) || Date.now() > Date.parse(certificate.validTo)) throw new Error("Invalid certificate");
}

// Live development only. Provider trust is an explicit approved alternative to local signature verification.
export function readLiveKycConfig(env = process.env, read = readFileSync, checkCertificate = verifyCertificate) {
  if (env.PAYTEAM_LIVE_KYC_ENABLED !== "true") return null;
  if (env.APP_ENV !== "development" || env.NODE_ENV === "production" || env.IDTO_PROVIDER_MODE !== "idto" || String(env.IDTO_SKIP_XML_SIGNATURE_VERIFICATION || "false").toLowerCase() !== "false") {
    throw new Error("Live KYC testing requires development, IDTO mode and no global XML signature bypass");
  }
  for (const key of ["IDTO_CLIENT_ID", "IDTO_API_KEY", "IDTO_BASE_URL", "IDTO_REDIRECT_URL"]) {
    if (!env[key]?.trim()) throw new Error(`Live KYC requires ${key}`);
  }
  let base, callback;
  try { base = new URL(env.IDTO_BASE_URL); callback = new URL(env.IDTO_REDIRECT_URL); } catch { throw new Error("Invalid live IDTO URL configuration"); }
  if (base.origin !== "https://prod.idto.ai" || base.pathname !== "/" || base.username || base.password || base.search || base.hash || callback.protocol !== "https:" || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== "/api/kyc/digilocker/callback") throw new Error("Live KYC requires approved HTTPS IDTO and callback URLs");
  const aadhaarTrustMode = env.PAYTEAM_AADHAAR_TRUST_MODE?.trim() || "issuer_signature";
  if (!["issuer_signature", "idto_provider"].includes(aadhaarTrustMode)) throw new Error("Invalid PAYTEAM_AADHAAR_TRUST_MODE");
  if (aadhaarTrustMode === "issuer_signature") {
    if (!env.IDTO_AADHAAR_XML_TRUSTED_CERT_PATH?.trim()) throw new Error("Live KYC requires IDTO_AADHAAR_XML_TRUSTED_CERT_PATH");
    try { checkCertificate(env.IDTO_AADHAAR_XML_TRUSTED_CERT_PATH); } catch { throw new Error("Configure a valid independently trusted Aadhaar signing certificate"); }
  }
  // An existing approved document can still be used explicitly. Normal development
  // requires no external disclosure file. Never silently replace an invalid override.
  const documentPath = env.PAYTEAM_KYC_DISCLOSURES_PATH?.trim();
  let doc = developmentDocument;
  if (documentPath) {
    try { doc = JSON.parse(read(documentPath, "utf8")); } catch { throw new Error("PayTeam KYC disclosure override is missing or invalid"); }
  }
  if (!validVersion(doc?.version) || !validText(doc?.disclosures?.aadhaar)) throw new Error("Approved Aadhaar disclosure and version are required");
  const disclosures = Object.freeze(Object.fromEntries(steps.filter(key => validText(doc.disclosures?.[key])).map(key => [key, doc.disclosures[key].trim()])));
  const mediaReady = Boolean(disclosures.media && validText(doc.mediaRetention) && validText(doc.videoConsentScript) &&
    ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].every(key => env[key]?.trim() && !/replace|change.?me|placeholder|example/i.test(env[key])));
  const a = doc.agreement;
  const expectedAgreementCode = documentPath ? "PAYTEAM_CUSTOMER_AGREEMENT" : DEVELOPMENT_AGREEMENT_CODE;
  const agreement = a?.code === expectedAgreementCode && validVersion(a.version) && typeof a.title === "string" && a.title.trim() && a.title.length <= 200 && validText(a.content)
    ? Object.freeze({ code: a.code, version: a.version, title: a.title.trim(), content: a.content.trim() }) : null;
  return Object.freeze({ version: doc.version, disclosures, aadhaarTrustMode, aadhaar: true, pan: Boolean(disclosures.pan), bank: Boolean(disclosures.bank), media: mediaReady, mediaRetention: mediaReady ? doc.mediaRetention.trim() : null, videoConsentScript: mediaReady ? doc.videoConsentScript.trim() : null, agreement });
}

let runtimeConfig;
export function getLiveKycConfig() {
  if (runtimeConfig === undefined) runtimeConfig = readLiveKycConfig();
  return runtimeConfig;
}
