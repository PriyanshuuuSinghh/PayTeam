# PayTeam Phase 0 audit

**Status:** Phase 0 code and documentation audit completed in the AquaPay workspace. PayTeam is published on its independent `origin/main` branch. This is an engineering inventory, not launch approval.

## Source and Git inventory

- Workspace: `D:/AquaPay/AQUAPAY-1`.
- Audited source revision: `00117e1` on `feature/pg-implementation`.
- Existing Git remote at audit start: AquaPay `origin`. The PayTeam remote must be added separately; AquaPay history and remote must remain available as `upstream`.
- The initial worktree already contained user changes to backend configuration, migrations, payment/scheme prototypes, and frontend files. Those files were kept; no reset, clean, or stash-drop was used.
- Repository areas: Node.js/Express API in `backend/`, React/Vite application in `frontend/`, MySQL SQL in `backend/database/`, feature tests alongside backend modules, and backend CI in `.github/workflows/ci.yml`. No Docker or Compose definition was found.
- The SQL numbering is scoped by directory: `migrations/001_initial_schema.sql` and `seeds/001_roles.sql` are separate migration/seed sequences, so there are two `001` files overall. There is only one `002` SQL file in the workspace: `migrations/002_auth_security_tables.sql`. The migration filenames skip `004`; no `004` SQL file is present. Financial SQL is preserved under `database/future-migrations/009_...` and `010_...`; it is excluded from the default migration runner. No duplicate version exists within the active migration order.
- The frontend has no test suite configured. Backend test files are colocated with modules. CI currently covers backend checks only.
- No `.env`, local credential backup, private key, upload, or build output is tracked in the current index. The available Git history also contains no tracked `.env` path. The checked-in DigiLocker `.crt` files are mock test fixtures, not private keys. Real local environment values are intentionally omitted from this report.

## Reuse, adaptation, replacement, and missing work

| Area | Phase 0 finding |
| --- | --- |
| Reuse with review | Express structure, password hashing, stateless JWT authentication, MySQL/Redis access, transactional KYC case creation helper, KYC step/state services, encrypted identity and bank persistence, provider adapters, private media storage, and admin review workflow. Each needs PayTeam provider, product, privacy, and operational review before production use. |
| Adapt for B2C | Customer registration, user data projection, role enforcement, company/scheme assignment, KYC consent and business details, rejected-case correction policy, customer eligibility enforcement, service navigation, deployment credentials, and branding. |
| Replace or keep disabled | AquaPay Agent Agreement and AquaPay-specific consent text must be replaced by approved PayTeam text. Step 6 is disabled in both UI and API until then. Scheme/payment routes are not mounted and financial SQL is not a default migration. |
| Missing | Public customer registration, customer self-service correction policy, verified OTP delivery, PayTeam legal terms/privacy/consent text, approved company/scheme defaults, a complete customer contract serializer, KYC/scheme eligibility authorization for services, production provider credentials/certificates, and an audit trail for admin reads of sensitive KYC records. |

## Roles, ownership, and defaults

- The intended and freshly seeded PayTeam roles are `AD` (Admin, ID 1) and `US` (User/Customer, ID 2). The role seed now contains only those rows; no parent-child role edges are seeded. Legacy hierarchy tables and nullable `users.parent_id` remain in the schema for compatibility, but they are not a PayTeam customer permission model.
- `users.company_id` and `users.parent_id` are nullable in the current schema. There is no seeded default company, default scheme, parent, or customer scheme assignment. Do not fill these values from a public request. Their business meanings/defaults require approval.
- The current `POST /api/users` route is authenticated and takes role/creator context from an existing B2B user hierarchy. It is not public registration. The existing `initKycCaseForUser({ userId, actorId }, connection)` helper is invoked inside the user-creation transaction and can be reused after the registration boundary and ownership rules are redesigned.
- No customer-facing numeric business-type map is defined. Current KYC stores `business_type` as free-form text. `shopname` is an existing merchant-oriented field; PayTeam must decide whether to retain it or replace it with a B2C concept.
- No company/scheme defaults are configured. Scheme assignment must be an explicit PayTeam decision.

## Seven-step KYC map

The KYC modules are organized under `/api/kyc`. The default HTTP router currently mounts basic details, status, agreement, and submission only. Provider-backed Aadhaar/PAN/bank and media routes stay unmounted until PayTeam approves their customer disclosures, provider permissions, and data-retention rules.

| Step | Existing behavior and route/service area | PayTeam status |
| --- | --- | --- |
| 1. Basic details and OTP | `basic-details/` collects customer details and uses a Redis-backed OTP challenge. Development delivery logs the code locally; non-development delivery fails closed because no approved SMS/email OTP provider is configured. | Reuse the transaction/state model after customer fields, consent, and OTP delivery are approved. |
| 2. Aadhaar / DigiLocker | `document-verification/digilocker/` contains OAuth state/callback and provider-session code; Aadhaar parsing validates document structure and identity data, then persists identity encrypted by key version. The active Aadhaar parser explicitly does not claim cryptographic signature verification. The XML signature helper is not called by the active handler. The API routes and customer UI are disabled pending PayTeam approval. | Provider credentials, callback, trusted signature/authenticity policy, consent purpose, and production verification must be approved and exercised with PayTeam's provider account. The inherited handler still contains AquaPay consent-purpose text and must be adapted before that module is mounted. |
| 3. PAN / IDTO | PAN verification uses the IDTO adapter, validates returned data, compares its name with verified Aadhaar, and stores encrypted identity with a masked display identifier. The API route and customer UI are disabled pending PayTeam approval. | Requires PayTeam credentials, approved PAN consent/disclosures, and verification policy. |
| 4. Bank account | The bank module verifies through the IDTO integration. The schema stores the full account number encrypted and a separate last-four projection; bank name and IFSC are separate fields. The API route and customer UI are disabled pending PayTeam approval. | Confirm provider permissions, verification outcomes, correction policy, and customer-facing bank-field requirements. |
| 5. Shop image, selfie, and live video | Media records use `shop_image`, `selfie`, and `consent_video`; Cloudinary is used for storage and admin document access is a short-lived private download URL. The API routes and customer UI are disabled pending approved PayTeam media purposes, disclosures, and retention rules. | Confirm media purpose, retention/deletion, allowed formats, customer consent, and whether shop imagery/business video belongs in B2C KYC. |
| 6. Agreement acceptance | Existing AquaPay Agent Agreement was unsafe to expose as PayTeam terms. The UI now shows a pending-approval state; the API returns `503 AGREEMENT_NOT_CONFIGURED` without reading or writing acceptance. | Legal owner must supply approved PayTeam agreement text, version, acceptance semantics, and company identity. |
| 7. Final submission | Submission requires completed Steps 1–6, transitions the case to `submitted`, records the final step and status history, and exposes submission/review state. | This is a server-side final submission action, not an independent pre-submission form. Confirm required final acknowledgement and review SLAs. |

When a case is rejected, the media restart workflow resets Steps 5–7 and retains Steps 1–4, including the verified identity/bank records. There is no approved correction workflow to change Aadhaar, PAN, or bank details in Steps 1–4; those changes require a separately authorized process. Existing tests cover the preservation/restart path, but PayTeam policy and operational evidence remain outstanding.

Admin approval/rejection writes `kyc_status_history` with actor and reason. Sensitive KYC detail and document reads have no corresponding admin-read audit event in the current implementation; add one before handling production customer records.

## Data contract mapping

The default schema separates account, KYC case, verification, bank, media, agreement, and wallet concerns. It does not place the full expected contract on `users`.

| Requested field/group | Existing storage or gap |
| --- | --- |
| `id`, `name`, `email`, `mobile`, `address`, `city`, `state`, `pincode`, `created_at`, `updated_at` | `users`; public response shape still needs a PayTeam-specific serializer review. |
| `role_id`, `company_id`, `parent_id`, `status` | `users`. Role rows are AD=1 and US=2. Company/parent are nullable. Account status is `active`, `inactive`, or `blocked`; it is distinct from KYC status. |
| Password and `is_passwordchanged` | `password_hash` only; bcryptjs is used. No plaintext `password_old` column is present. A password-changed boolean is not defined. |
| `aadharcard`, `pancard`, `pan_name`, `dob`, `digilocker_id` | Full identity payload is in `kyc_identity_data` encrypted by key version. `kyc_verifications` holds verification type/provider/reference, status, masked identifier, and verified name. There is no `users.digilocker_id`; provider session/reference identifiers are separate session data. |
| `accountnumber`, `bankname`, `ifsccode` | `bank_accounts` stores encrypted full account number plus `account_number_last4`, bank name, IFSC, and verification status. No plaintext account number field is used for normal projection. |
| `shop_image`, `merchant_selfie`, `merchant_video` | Normalized `media_assets` by case and asset type (`shop_image`, `selfie`, `consent_video`); these are not user-table columns. |
| `is_agreement` | No user boolean. Acceptance is represented by `agreement_acceptances` with code/version/time. PayTeam acceptance is currently disabled pending approved terms. |
| `kyc`, `progress` | KYC state is a projection from `kyc_cases` and `kyc_steps`. `steps_completed` counts completed steps (0–7); `current_step` tracks the first active/pending step. There is no `users.progress` column. User account status and KYC case status are separate. |
| `businesstype` | `kyc_cases.business_type` is nullable free-form text, not a numeric enum. A mapping is a product decision. |
| `scheme_id` and nested `scheme` | Not on the default user/KYC schema and not assigned by default. Future scheme SQL is parked outside the default migration path. |
| Five balances (`mainbalance`, `lockamount`, `pgbalance`, `qrbalance`, `settlementwallet`) | None exist in the default schema. Parked future financial SQL defines a generic INR wallet with `balance_paise` and a ledger; it does not establish meanings or mapping for the five requested fields. |
| `profilepic`, merchant ID/MID/POS MID | Not present in the default schema or current KYC contract. Business requirement and ownership need confirmation. |
| Nested `parent`, `role`, `scheme` objects | Existing AquaPay user retrieval has role/company/parent-oriented projections, but the PayTeam public response contract has not been approved. A scheme object is not available in the default schema. |

Do not add redundant user columns until PayTeam signs off the serializer and field semantics. In particular, wallet definitions, business type values, `progress`, KYC status projection, DigiLocker identifier meaning, scheme eligibility, merchant identifiers, and nullable company/parent requirements remain decisions.

## Services and provider readiness

- **Implemented foundation:** authentication, protected account/admin routes, KYC case/step APIs, admin review, bank/identity encryption, rate limiting and ephemeral state on Redis, private KYC media access, and payment/scheme prototype modules.
- **Provider integration:** DigiLocker/PAN/bank adapters are present for IDTO, with development mocks and configuration for production endpoints/certificates. The current ignored local `.env` selects IDTO mode and has provider fields populated, but ownership and PayTeam permissions are unverified; no outbound provider request was made during this configuration repair. Production permission, credentials, endpoint, redirect registration, and pinned issuer certificates still require confirmation.
- **OTP:** Redis challenge lifecycle is present, but no PayTeam OTP delivery provider/credentials are approved. Development logs are local-only; non-development fails closed.
- **Future financial services:** payment and scheme code is preserved for reference but its routers are not registered in `app.js`; SQL lives in `database/future-migrations/` and is rejected by the default migration ordering. No service access is safe until backend KYC approval and applicable scheme eligibility are checked server-side.
- **Recovery delivery:** the existing reset/recovery provider settings are represented in `.env.example`; PayTeam delivery provider accounts and links require setup. JWT is stateless; no refresh-token or token-version settings were found.

## Environment and local isolation

- `backend/src/config/env.js` loads only `backend/.env` regardless of shell working directory and validates environment mode, PayTeam database name (`payteam_*`), Redis namespace (`payteam:`), OTP policy, and production integration requirements. `APP_ENV` resolves from `APP_ENV`, then `NODE_ENV`, then a development default. Development Redis defaults are loopback-only and use the `payteam:development` prefix; tests and production require explicit host and prefix values.
- On the current configuration repair pass, the ignored local `backend/.env` still contains legacy `NODE_ENV`, `PORT`, and `REDIS_URL` entries and a database name that does not meet the PayTeam prefix guard. Existing local values were preserved and no secret values were printed. Configure a separately provisioned `payteam_*` database before starting PayTeam; the legacy Redis URL is not consumed.
- `backend/.env.example` uses placeholders only. `frontend/.env.example` contains only the local API base URL. `.gitignore` excludes `.env*` other than `.env.example`, private key/certificate formats, uploads, builds, and coverage.
- Existing encryption uses separate versioned keys for identity and provider-session payloads plus a bank-account key. A generic `ENCRYPTION_KEY` would not be consumed by this code, so it was not introduced. A `LOG_LEVEL` setting is also unsupported by the current console logger. Customer/admin origins currently share one Vite frontend; use the existing `CORS_ORIGINS` allowlist until separate apps are approved. No default company/scheme variables were added without values or behavior approval.
- Production deployment requires separately provisioned PayTeam MySQL and Redis, unique JWT/OTP/encryption keys, authenticated Redis, HTTPS origins, private Cloudinary configuration, and approved IDTO configuration. Never point PayTeam at AquaPay production.

## Security and release blockers

- Passwords are hashed with bcryptjs; API safe-user paths omit `password_hash`. No plaintext password field is present.
- Aadhaar/PAN payloads use AES-GCM encrypted records with key version, IV, and authentication tag. Bank account numbers have encrypted storage and a last-four display field. Normal APIs should continue masking identifiers.
- KYC media is private and admin access uses short-lived download URLs. Admin KYC read access is not separately audited yet.
- Public registration is absent; do not permit a customer to choose role, company, parent, scheme, wallet values, account/KYC status, or admin rights. Extract/reuse the existing transactional KYC initializer only after the server-owned default company/scheme and role policy are confirmed.
- Before any customer launch, approve legal agreements and all inherited consent text, customer identity and business fields, OTP delivery, provider credentials and signature certificates, default company/scheme rules, identity/bank correction controls, retention/deletion, admin read auditing, service eligibility policy, and customer API response contract.

## Decisions required from the product/business owner

1. Which PayTeam legal entity, agreement, privacy notice, Aadhaar/PAN/bank consents, and media declarations should customers accept, and which versioning/evidence is required?
2. What company should new customers belong to, or is `company_id` intentionally null? Is there a default scheme, and what exact rules establish scheme eligibility?
3. Which fields are required at registration and in KYC, including whether `shopname`, business type, shop photo, and live video belong in B2C onboarding?
4. What are the approved business-type codes/labels and the definitions/mapping of each of the five wallet values? Do customers need profile pictures, merchant IDs, MIDs, or POS MIDs?
5. How should customers request corrections to verified Aadhaar, PAN, and bank data, and what admin checks/status history are required?
6. Which OTP, DigiLocker/IDTO, bank verification, Cloudinary, and account-recovery provider accounts and production endpoints/certificates belong to PayTeam?
7. What audit retention, KYC media retention/deletion, customer data export, and admin sensitive-data access policy should be enforced?
8. What KYC approval and scheme eligibility combination gates each future financial service?

## Git and verification handoff

The PayTeam GitHub remote is `https://github.com/PriyanshuuuSinghh/PayTeam.git`. It was reachable during inspection and returned no branch or tag refs, so no existing remote history needed reconciliation. The existing AquaPay remote must remain available as `upstream`; PayTeam is configured as `origin` for the independent project. Never force-push or push to AquaPay.

Checks completed on the Phase 0 workspace:

- `npm.cmd ls --depth=0` in `backend/` and `frontend/` — both dependency trees resolve.
- `npm.cmd test` in `backend/` with a process-only `DB_NAME=payteam_test` override — 404 tests passed, 0 failed. The ignored local DB name is intentionally preserved and fails the PayTeam database-prefix guard. Tests cover migration ordering, security, KYC, rejection/retry, agreement fail-closed, environment defaults, and bank-key validation.
- `npm.cmd run build` in `frontend/` — passed. Vite reported the existing large-chunk advisory (>500 kB).
- `npm.cmd run lint` in `frontend/` — passed with existing lint warnings; no lint errors.
- The earlier Phase 0 startup attempt failed on missing `KYC_OTP_SECRET`. In this repair pass, the existing local OTP/JWT/encryption values pass format checks. Normal startup then fails safely because the local DB name is not PayTeam-prefixed; a process-only `DB_NAME=payteam_dev` attempt reached local MySQL and was denied by its configured account. No migration or database write was run.
- Default migration inventory/order tests passed. No database migration or live provider check was run.
- Staged whitespace check and a redacted scan of staged secret-like assignments/private file paths found no issues. Only placeholder environment examples are tracked.

The final task report records the resulting local branch, remote names, initial push outcome, and any remaining setup. No migration is run against AquaPay production as part of this audit.
