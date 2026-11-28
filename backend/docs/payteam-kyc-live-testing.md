# PayTeam live-provider KYC development testing

This change uses the real IDTO and Cloudinary integrations. It does not enable mock verification routes, silently bypass Aadhaar signature checks, approve KYC automatically, or enable payment services. Production operation is not enabled by this change; development OTP is still terminal-only. Use only explicitly authorized test customers, provider credentials, and a suitable development database. Real provider requests can incur charges and store personal data.

## Setup

1. No external disclosure JSON is required for authorized development testing. Remove `PAYTEAM_KYC_DISCLOSURES_PATH` from `.env` to use the built-in versioned test notices and development acknowledgement. Only an explicitly authorized participant may use real identity data; review the notices and agree before submitting. The built-in acknowledgement is not production customer terms. Media is stored privately using Cloudinary and automatic retention/deletion is not implemented; operators must arrange authorized test-data cleanup. An optional approved document override remains supported if needed; never use placeholder or incomplete approval text. Production startup rejects records of the built-in development acknowledgement.
2. Select an approved Aadhaar trust model. By default `issuer_signature` requires an independently trusted signing certificate. The original AquaPay workflow uses a different trust boundary: the authenticated IDTO response and strict Aadhaar XML parsing, without local XML signature verification. If IDTO and your organization's responsible compliance/security owner confirm this trust model for authorized development testing, explicitly set `PAYTEAM_AADHAAR_TRUST_MODE=idto_provider`; no local Aadhaar certificate is required for that mode. These results are tagged `idto_digilocker_v1_provider_trust`, and production startup rejects databases containing them until a production trust model and record review are implemented. Do not use this opt-in as a substitute for provider assurance or approval. PAN's signature policy is unchanged.
3. Configure the existing IDTO credentials, encryption keys, Redis and MySQL as before. Cloudinary credentials are needed only for the media step. Do not paste credentials into source files, logs or Postman exports. Register an authorized HTTPS callback that forwards to `/api/kyc/digilocker/callback`; localhost HTTP is not sufficient for live mode. Use a restricted development environment; do not expose the entire dev API publicly just to receive the callback.
4. Set these additional values in `backend/.env` (replace path/domain placeholders):

```dotenv
APP_ENV=development
IDTO_PROVIDER_MODE=idto
IDTO_BASE_URL=https://prod.idto.ai
IDTO_REDIRECT_URL=https://YOUR_APPROVED_CALLBACK_HOST/api/kyc/digilocker/callback
IDTO_SKIP_XML_SIGNATURE_VERIFICATION=false
PAYTEAM_AADHAAR_TRUST_MODE=issuer_signature
IDTO_AADHAAR_XML_TRUSTED_CERT_PATH=C:/private/issuer-aadhaar-signing.crt
PAYTEAM_LIVE_KYC_ENABLED=true
```

Unset the flag or set it to false to keep provider routes disabled. Restart the backend after configuration changes. Explicit opt-in with invalid configuration fails startup, rather than silently calling a provider.

## Requests (Postman)

Set `baseUrl` to the existing backend API base, `accessToken` to a newly verified customer JWT, and `consentVersion` to the value returned by `GET /kyc/capabilities`. Use bearer authentication for all calls except the DigiLocker authorization and callback. For provider write requests, add header `X-KYC-Consent-Version: {{consentVersion}}` only after the authorized test customer has reviewed the returned disclosure and consented. Do not share tokens or actual identity values.

| Method | Path | Body / action |
|---|---|---|
| GET | `/kyc/capabilities` | Read versioned notices and capability flags. |
| GET | `/kyc/status` | Check current step. |
| PUT | `/kyc/basic-details` | `{"businessType":"Sole Proprietorship","shopAddress":"<authorized test address>"}` |
| POST | `/kyc/basic-details/request-otp` | `{}` |
| POST | `/kyc/basic-details/verify-otp` | `{"otp":"<terminal KYC OTP>"}` |
| POST | `/kyc/digilocker/aadhaar/initiate` | `{"consent":true}`; add consent header. |
| GET | returned `authorizationUrl` | Open in browser, complete DigiLocker; do not construct callback values manually. |
| GET | `/kyc/digilocker/aadhaar/status?sessionId={{sessionId}}` | Use returned session ID; require backend VERIFIED. |
| POST | `/kyc/pan/verify` | `{"panNumber":"<authorized PAN>","consent":true}`; add consent header. |
| PUT | `/kyc/bank-details` | `{"accountNumber":"<authorized account>","ifscCode":"<authorized IFSC>"}`; add consent header. |
| GET | `/kyc/bank-details` | Masked saved bank details. |
| POST | `/kyc/media/upload` | multipart fields `file` and `assetType`; allowed types `selfie`, `shop_image`, `consent_video`; add consent header. Use frontend recorder for live consent video. |
| GET | `/kyc/media/status` | Confirm upload types; no storage URLs returned. |
| GET | `/kyc/agreement` | Read the current development acknowledgement or configured agreement. |
| POST | `/kyc/agreement/accept` | `{"accepted":true,"agreementCode":"<returned code>","agreementVersion":"<returned version>"}` |
| POST | `/kyc/submit` | `{"confirm":true}`; sends application for review, does not approve it. |

For rejection/resubmission, existing `/kyc/media/restart` preserves steps 1–4 and requires all three fresh uploads; the agreement and submission steps must be completed again. Existing financial services remain unregistered.

## Verification before release

Run `npm test` in backend, `npm run build` and `npm run lint` in frontend, then test the real flow and all failure cases. Unit tests in `liveKycConfig.test.js` check only the activation gate; they do not validate actual provider responses, signature compatibility, Cloudinary, or persistence. Review consent audit retention, actual storage deletion policy, API rate limiting, pre-existing verification provenance, provider response contracts, production OTP delivery and admin review access before any release. A recorded video is not by itself proof of a compliant live V-CIP procedure.
