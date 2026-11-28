import test from "node:test";
import assert from "node:assert/strict";
import { readLiveKycConfig } from "./liveKycConfig.js";

// Configuration tests only; these are never used as live credentials or consent text.
const env = { PAYTEAM_LIVE_KYC_ENABLED:"true", APP_ENV:"development", IDTO_PROVIDER_MODE:"idto", IDTO_SKIP_XML_SIGNATURE_VERIFICATION:"false", IDTO_CLIENT_ID:"test", IDTO_API_KEY:"test", IDTO_BASE_URL:"https://prod.idto.ai", IDTO_REDIRECT_URL:"https://test.example/api/kyc/digilocker/callback", IDTO_AADHAAR_XML_TRUSTED_CERT_PATH:"test.crt", PAYTEAM_KYC_DISCLOSURES_PATH:"test.json", CLOUDINARY_CLOUD_NAME:"test", CLOUDINARY_API_KEY:"test", CLOUDINARY_API_SECRET:"test" };
const text = "Configuration validation test content only.";
const doc = {version:"v1", disclosures:{aadhaar:text,pan:text,bank:text,media:text},mediaRetention:text,videoConsentScript:text,agreement:{code:"PAYTEAM_CUSTOMER_AGREEMENT",version:"v1",title:text,content:text}};
const read = d => () => JSON.stringify(d);
const cert = () => {};
test("live KYC disabled by default",()=>assert.equal(readLiveKycConfig({}),null));
test("real mode and development opt-in required",()=>{for(const overrides of [{APP_ENV:"production"},{NODE_ENV:"production"},{IDTO_PROVIDER_MODE:"mock"},{IDTO_SKIP_XML_SIGNATURE_VERIFICATION:"true"}]) assert.throws(()=>readLiveKycConfig({...env,...overrides},read(doc),cert),/requires development/);});
test("rejects unapproved hosts, insecure callbacks, and absent credentials",()=>{for(const overrides of [{IDTO_BASE_URL:"https://example.com"},{IDTO_REDIRECT_URL:"http://localhost/api/kyc/digilocker/callback"},{IDTO_REDIRECT_URL:"https://test.example/other"},{IDTO_API_KEY:""}]) assert.throws(()=>readLiveKycConfig({...env,...overrides},read(doc),cert));});
test("default issuer signature mode requires a trusted certificate",()=>assert.throws(()=>readLiveKycConfig(env,read(doc),()=>{throw Error("bad");}),/trusted Aadhaar signing certificate/));
test("Aadhaar requires its own approved disclosure and version",()=>{for(const d of [{...doc,version:""},{...doc,disclosures:{}}])assert.throws(()=>readLiveKycConfig(env,read(d),cert),/disclosure/);});
test("Aadhaar can activate before later steps are configured",()=>{
  const result=readLiveKycConfig({...env,CLOUDINARY_API_KEY:"",CLOUDINARY_API_SECRET:"",CLOUDINARY_CLOUD_NAME:""},read({version:"v1",disclosures:{aadhaar:text}}),cert);
  assert.equal(result.aadhaar,true); assert.equal(result.pan,false); assert.equal(result.bank,false); assert.equal(result.media,false); assert.equal(result.agreement,null);
});
test("missing media settings disable only media",()=>{for(const d of [{...doc,mediaRetention:""},{...doc,videoConsentScript:""},{...doc,disclosures:{...doc.disclosures,media:""}}]) {const result=readLiveKycConfig(env,read(d),cert);assert.equal(result.aadhaar,true);assert.equal(result.media,false);assert.equal(result.pan,true);}});
test("invalid or unapproved agreement stays unavailable",()=>{assert.equal(readLiveKycConfig(env,read({...doc,agreement:{...doc.agreement,code:"AQUAPAY_AGENT_AGREEMENT"}}),cert).agreement,null);assert.equal(readLiveKycConfig(env,read({...doc,agreement:null}),cert).agreement,null);assert.equal(readLiveKycConfig(env,read(doc),cert).agreement.version,"v1");});
test("complete valid configuration enables all provider steps",()=>{const result=readLiveKycConfig(env,read(doc),cert);for(const key of ["aadhaar","pan","bank","media"])assert.equal(result[key],true);});

test("explicit IDTO provider trust does not require a local Aadhaar certificate", () => {
  const result = readLiveKycConfig({...env, PAYTEAM_AADHAAR_TRUST_MODE:"idto_provider", IDTO_AADHAAR_XML_TRUSTED_CERT_PATH:""},read(doc),()=>{throw Error("must not call certificate validator");});
  assert.equal(result.aadhaarTrustMode,"idto_provider"); assert.equal(result.aadhaar,true);
});
test("no implicit downgrade and no invalid trust mode", () => {
  assert.throws(()=>readLiveKycConfig({...env,IDTO_AADHAAR_XML_TRUSTED_CERT_PATH:""},read(doc),cert),/TRUSTED_CERT_PATH/);
  assert.throws(()=>readLiveKycConfig({...env,PAYTEAM_AADHAAR_TRUST_MODE:"skip"},read(doc),cert),/Invalid PAYTEAM_AADHAAR_TRUST_MODE/);
});
test("provider trust does not enable production, mock or global signature bypass",()=>{
  for (const overrides of [{APP_ENV:"production"},{NODE_ENV:"production"},{IDTO_PROVIDER_MODE:"mock"},{IDTO_SKIP_XML_SIGNATURE_VERIFICATION:"true"}]) assert.throws(()=>readLiveKycConfig({...env,PAYTEAM_AADHAAR_TRUST_MODE:"idto_provider",...overrides},read(doc),cert));
});


test("development uses built-in notices without an external file", () => {
  const config = readLiveKycConfig({...env, PAYTEAM_KYC_DISCLOSURES_PATH:"", PAYTEAM_AADHAAR_TRUST_MODE:"idto_provider", IDTO_AADHAAR_XML_TRUSTED_CERT_PATH:""}, () => { throw Error("no file should be read"); }, () => { throw Error("no certificate should be read"); });
  for (const key of ["aadhaar", "pan", "bank", "media"]) {
    assert.equal(config[key], true);
    assert.match(config.disclosures[key], /Development test/);
  }
  assert.equal(config.agreement.code, "PAYTEAM_DEVELOPMENT_KYC_ACKNOWLEDGEMENT");
  assert.equal(config.agreement.version, "dev-v1");
  assert.match(config.agreement.content, /not a production customer agreement/);
  assert.match(config.mediaRetention, /Automatic deletion is not implemented/);
});
test("built-in notices do not bypass Cloudinary credential requirements", () => {
  for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
    const config = readLiveKycConfig({...env, PAYTEAM_KYC_DISCLOSURES_PATH:"", [key]:""}, undefined, cert);
    assert.equal(config.media, false);
    assert.equal(config.pan, true);
    assert.equal(config.bank, true);
  }
});
test("explicit disclosure override is honored and a bad override fails closed", () => {
  assert.equal(readLiveKycConfig(env, read(doc), cert).agreement.code, "PAYTEAM_CUSTOMER_AGREEMENT");
  assert.throws(() => readLiveKycConfig(env, () => "not json", cert), /override/);
});
test("built-in development document cannot activate production or mock KYC", () => {
  for (const overrides of [{APP_ENV:"production"},{NODE_ENV:"production"},{IDTO_PROVIDER_MODE:"mock"},{IDTO_SKIP_XML_SIGNATURE_VERIFICATION:"true"}]) {
    assert.throws(() => readLiveKycConfig({...env, PAYTEAM_KYC_DISCLOSURES_PATH:"", ...overrides}, undefined, cert), /requires development/);
  }
});
