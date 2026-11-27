# PayTeam backend

PayTeam's Node.js/Express API uses MySQL for account/KYC records and Redis for OTP challenges and rate limits. DigiLocker, PAN, and bank verification adapters use the existing IDTO integration. KYC media is stored through Cloudinary. AquaPay-specific source contracts remain reference material and require PayTeam approval before customer use.

The Aadhaar, PAN, bank, DigiLocker, and media HTTP routes are intentionally not mounted until PayTeam approves customer disclosures, provider permissions, and media retention rules. Their modules remain available for audit and tests. The agreement endpoints fail closed until approved PayTeam terms are configured.

## Configuration

Copy `.env.example` to `.env` and provide PayTeam-only values. `src/config/env.js` loads this file from the backend directory regardless of the shell's current directory. Required startup settings include application name/environment/port, a `payteam_*` database, Redis host/port and `payteam:` key prefix, JWT secret, KYC OTP secret, and versioned KYC encryption keys. Production additionally requires authenticated Redis, HTTPS frontend origins, Cloudinary credentials, and IDTO provider configuration.

The local `.env` contains no copied AquaPay credentials. The previous local configuration is preserved separately in ignored `.env.aquapay.local` and is not a PayTeam configuration source.

## Database

Provision a separate `payteam_*` database before migration. The migrations do not create or select a hard-coded database. Run:

```sh
npm run migrate
npm run seed
```

The default migration directory contains the user/auth and KYC schema only. Payment/scheme routes are not registered, and their preserved SQL is under `database/future-migrations/` until PayTeam's B2C eligibility and product contracts are approved.

## Commands

- `npm run dev` — development API.
- `npm start` — API server.
- `npm test` — Node's built-in test runner.
- `npm run migrate` — PayTeam database migrations.
- `npm run seed` — PayTeam role seed.

OTP email/SMS delivery for KYC has not been approved or integrated. Development OTPs are logged locally; non-development KYC OTP requests fail closed. Review `docs/PAYTEAM_PHASE_0_AUDIT.md` before enabling any customer flow.
