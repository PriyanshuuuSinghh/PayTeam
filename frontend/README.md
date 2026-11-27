# PayTeam frontend

PayTeam's React/Vite single-page application contains customer authentication, KYC screens, and protected admin review screens. Customer and admin views currently share one frontend origin; `VITE_API_BASE_URL` is the only frontend environment setting and must contain no credentials.

Copy `.env.example` to `.env`, then use `npm run dev` for local work. Use `npm run build` for a production bundle and `npm run lint` for linting.

The UI role model is limited to Admin (`AD`) and User/Customer (`US`). The B2B team/downline route is not registered. Financial service routes are disabled pending a server-side KYC approval and scheme-eligibility policy. Aadhaar, PAN, media, and agreement screens are blocked pending approved PayTeam customer disclosures; see `../backend/docs/PAYTEAM_PHASE_0_AUDIT.md`.
