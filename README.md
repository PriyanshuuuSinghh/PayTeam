# PayTeam

PayTeam is an independent B2C customer onboarding and KYC foundation. AquaPay is retained as an internal technical reference; PayTeam uses its own configuration, database namespace, roles, branding, and deployment credentials.

**Phase 0 status:** architecture and data-contract audit, PayTeam configuration isolation, and repository setup are complete locally. This codebase is not ready for customer or production traffic. See [the Phase 0 audit](backend/docs/PAYTEAM_PHASE_0_AUDIT.md) for verified capabilities and launch blockers.

## Workspace

- `backend/` — Node.js 20+, Express API, MySQL persistence, Redis OTP state, IDTO/DigiLocker, Cloudinary KYC media, and admin review routes.
- `frontend/` — React and Vite customer/admin SPA.
- `backend/database/migrations/` — default PayTeam identity and KYC migrations (001–008).
- `backend/database/future-migrations/` — preserved payment/scheme reference SQL; excluded from the default migration runner.

## Local setup

1. Create a dedicated MySQL database named with the `payteam_` prefix, such as `payteam_dev`. Do not point PayTeam at an AquaPay database.
2. Copy `backend/.env.example` to `backend/.env`. Set only PayTeam-owned database, Redis, JWT, KYC encryption, Cloudinary, and provider credentials. The app validates the database prefix and Redis namespace at startup.
3. From `backend/`, run `npm ci`, `npm run migrate`, and `npm run seed`.
4. Run `npm run dev` from `backend/`.
5. Copy `frontend/.env.example` to `frontend/.env`, then run `npm ci` and `npm run dev` from `frontend/`.

The checked-in environment examples contain placeholders only. The local `.env` is ignored and may contain developer-owned values; keep its secrets private and configure a dedicated PayTeam database and credentials before starting the API. Production deployments require separate provider credentials and encryption keys.

The Aadhaar, PAN, bank, KYC media, and agreement screens are blocked until PayTeam approves customer consent and disclosure text. Their provider/media HTTP routes are also unmounted. Do not enable customer onboarding until those product/legal decisions and provider credentials are complete.

## Checks

- Backend tests: `npm test` from `backend/`.
- Frontend production build: `npm run build` from `frontend/`.
- Frontend lint: `npm run lint` from `frontend/`.

Do not run PayTeam migrations against AquaPay. The migration runner accepts only a database name starting with `payteam_` and the SQL uses the database selected by `DB_NAME`.
