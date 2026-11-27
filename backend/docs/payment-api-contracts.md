# AquaPay payment reference contracts

> This documentation and the related source are retained as reference material only. PayTeam does not register these routes or include these SQL files in its default Phase 0 migration plan. Financial services need approved B2C eligibility, compliance, provider, and product contracts before activation.

Successful responses use `{ "statusCode": number, "data": ..., "message": string, "success": true }`. Failures use `{ "success": false, "message": string, "code": string, "errors"?: [...] }`. Authenticated routes require `Authorization: Bearer <access-token>`. Admin scheme writes use the existing server-side `requireAdmin`. A durable MySQL repository is implemented against the two new SQL files below. The files have not been executed; the database must be initialized by the project migration process before these APIs can persist data.

## Scheme Manager

| Method and path | Access | Request | Availability |
|---|---|---|---|
| `GET /api/schemes` | Authenticated | None | Returns only the account's assigned scheme, or the default scheme when unassigned. |
| `GET /api/schemes/services` | Authenticated | None | Returns the static catalogue below; provider mapping is null where unknown. |
| `POST /api/schemes` | Admin | `{ "name": "...", "isDefault": false }` | Durable; default changes serialize through `scheme_control`. |
| `PATCH /api/schemes/:schemeId` | Admin | `{ "name": "..." }` | Durable. |
| `PUT /api/schemes/:schemeId/default` | Admin | None | Durable atomic single-default update. |
| `PUT /api/schemes/:schemeId/users/:userId` | Admin | None | Durable; verifies active AD identity, target and scheme and records assignment history. |
| `PUT /api/schemes/:schemeId/services/:serviceCode/operators/:operator/configuration` | Admin | `{ "serviceCharge": {"type":"percentage|flat","value":"..."}, "instantCharge": null, "commissions": [{"hierarchyLevel":1,"type":"percentage|flat","value":"..."}] }` | Durable versioned configuration; `createdBy` comes from JWT. |
| `GET /api/schemes/me` | Authenticated | None | Returns the assigned scheme or the active default scheme when unassigned. |
| `GET /api/schemes/me/services/:serviceCode/operators/:operator` | Authenticated | None | Scheme-scoped safe projection omits commission rates. Diamond 4 operator IDs are `MASTERCARD`, `RUPAY`, `VISA`, `UPI`. They are AquaPay identifiers; provider operator values are not supplied. |

Catalogue names and supplied mappings:

| AquaPay service | Supplied provider mapping |
|---|---|
| Silver 1 | Nixa Silver 1 |
| DYNAMICQR | Unspecified |
| QRMTB | Unspecified |
| PREPAID | Unspecified |
| POSFUNDREQUEST | Unspecified |
| Premium 2 | Unspecified |
| Premium 4 | Unspecified |
| Diamond 3 | Nixa Silver 2 |
| RUPAYUPI | Unspecified |
| UPIPAYOUT | Unspecified |
| POSTPAID | Unspecified |
| NIXAPOS | Unspecified |
| Diamond 4 | Nixa Premium 3 / NixaSoft Premium PG 3 (`PREMIUM_PG_3`) |
| Silver 2 | Unspecified |
| Silver 3 | Nixa Silver 3 |
| Payout | Unspecified |
| CREDITCARD | Unspecified |
| DTH | Unspecified |
| NIXACFPG5 | Unspecified |
| Premium 5 | Nixa Premium 4 |
| Diamond 2 | Unspecified |
| Silver 4 | Nixa Silver 4 |
| MTB | Unspecified |
| BBPS | Unspecified |
| BBPSI | Unspecified |
| NIXAPREMlUM2 | Unspecified |
| Silver 5 | Nixa Silver 5 |
| Platinum 2 | Pinlab Yana Grocery |

## Persistence boundary contracts

`mysqlPayment.repository.js` is the production persistence adapter used by scheme and payment routers. It uses the existing MySQL pool and parameterized queries. No in-memory production store is used. It expects both SQL files to be applied after the existing schema migrations. MySQL DDL implicitly commits; neither new SQL file was executed as part of this task.

`payment_transactions` stores exact integer paise and separately stores AquaPay `request_id`, provider order ID, and unresolved `txn_id`. Durable uniqueness is scoped to `(user_id, operation, idempotency_key)` and `(gateway, operation, request_id)`, with unique provider order/txn correlations. `persistInitiation` atomically arbitrates concurrent same-key requests before a provider call. Replays use the stored row; a different normalized payload is rejected by the service with HTTP 409.

The payer's supplied name, phone, and email are used transiently for the provider request and are not persisted. Authenticated `user_id` and `initiator_user_id` identify the acting account; `customer_user_id` stays nullable because there is no trusted agent-to-customer account resolution contract. Delegated payer ownership still needs a business decision.

`payment_webhook_events` provides unique gateway/fingerprint deduplication and records correlation, authentication, processing state, and a sanitized JSON payload. The callback service strips payer/contact/card fields before persistence. Callback persistence and payment status application run in one database transaction. The HTTP callback route remains disabled. A wallet/commission posting boundary exists but requires payment `SUCCESS`, settlement `SETTLED`, and an explicitly supplied trusted wallet-credit amount because charge collection/credit policy is unresolved.

### Authorized SQL files

- `backend/database/future-migrations/009_financial_core.sql`: schemes, assignments/history, service/operator catalogue and mappings, versioned scheme rates, wallets, immutable ledger entries, and hierarchy commission entries.
- `backend/database/future-migrations/010_payment_transactions.sql`: shared Add Money/Payout/Bill transactions, callback inbox, settlement and reconciliation records, payout beneficiaries/records, and separate bill enquiry/payment records.
- These files are outside the default migration directory and are not applied by PayTeam's Phase 0 runner. Intended compatibility is Oracle MySQL 8.0.16+ (generated columns, enforced CHECK constraints, JSON and recursive CTE); actual server version was not verified because no database connection was made.

Only Diamond 4 has an operator list. Other service/operator applicability must come from approved configuration; no provider or operator mappings are inferred. Configuration keys are scheme, exact service ID, and operator ID. The repository must enforce scope and default-scheme uniqueness. Percentage configuration currently accepts at most two decimal places; this is a technical input bound, while applicable financial rounding remains unresolved.

## Add Money / Diamond 4

| Method and path | Access | Request | Success data | Availability |
|---|---|---|---|---|
| `POST /api/payments/add-money` | Authenticated | `{ "customer": { "name": "...", "phone": "...", "email": "..." }, "amount": "10.00", "operator": "UPI" }`; `Idempotency-Key` header (8-128 safe characters). Return URL comes from backend `NIXASOFT_PREMIUM_PG3_REDIRECT_URL`. Initiator/user ID is always from JWT. | `{ transactionId, request_id, gateway: "PREMIUM_PG_3", order_id, initiation_status_code: "TXN", payment_url, amount, charges, status: "PENDING", settlement_status: "UNCONFIRMED", intended_settlement_mode }` | Durable repository/provider adapter implemented; operational after SQL application, rates, configured token, and payer/charge policy confirmation. |
| `GET /api/payments/:requestId` | Authenticated owner/initiator scope | Merchant request ID path parameter | AquaPay status projection only | Durable owner-scoped lookup. |

NixaSoft request: `POST https://api.nixasoft.in/api/service/payin/premium-pg-3`, `apiToken` and JSON headers; body fields `customer_name`, `customer_phone`, `customer_email`, `amount` string, `redirect_url`, `requestId`. `NIXASOFT_PREMIUM_PG3_API_TOKEN` stays backend-only. Timeout is configurable with `NIXASOFT_PREMIUM_PG3_TIMEOUT_MS` (1,000-60,000 ms).

`TXN` records initiation success and returns the hosted URL while payment remains `PENDING`. `TXF` records initiation failure and must not redirect. Network/malformed/uncertain outcomes remain pending and reconciliation-required; never blindly retry. AquaPay `request_id`, provider `order_id`, and unresolved `txn_id` remain distinct. The original amount is sent to the provider; charge collection treatment needs business/provider confirmation. The server return URL is configured, never client-selected.

The idempotency key is scoped by authenticated user and operation, and bound to the normalized customer, amount, currency, service, and operator. Same-key/same-payload replay returns the stored transaction without another provider call; a different valid payload returns HTTP 409. PENDING replays return a checkout URL only when a valid TXN, provider order ID, and HTTPS URL were durably recorded. UNKNOWN or incomplete PENDING results return no URL and require reconciliation. SUCCESS and FAILED replays never return a reusable checkout URL. Redirect configuration is checked after the idempotency lookup so a stored replay does not depend on current configuration.

The callback service is an internal processing boundary only. No callback HTTP route is registered until NixaSoft confirms the callback transport, authentication, acknowledgement, and retry contract.

## Payout

| Method and path | Access | Request | Availability |
|---|---|---|---|
| `GET /api/payments/payouts/beneficiaries` | Authenticated owner scope | None | Repository/provider rules required. |
| `POST /api/payments/payouts/beneficiaries` | Authenticated | Opaque provider-specific object | Unavailable until provider rules define fields. |
| `POST /api/payments/payouts/beneficiaries/:beneficiaryId/verify` | Authenticated owner scope | None | Verification semantics/provider required. |
| `POST /api/payments/payouts` | Authenticated | `{ "beneficiaryId": "...", "amount": "decimal string" }` and `Idempotency-Key` | Provider-independent contract only; first create is HTTP 201, replay HTTP 200. |
| `GET /api/payments/payouts/:payoutId` | Authenticated owner scope | None | Requires repository/provider. |

## Credit Card Bill 2

| Method and path | Access | Request | Availability |
|---|---|---|---|
| `POST /api/payments/credit-card-bill-2/enquiries` | Authenticated | `{ "customerReference": "..." }` and `Idempotency-Key` | Provider-independent boundary only; first create is HTTP 201, replay HTTP 200. |
| `GET /api/payments/credit-card-bill-2/enquiries/:enquiryId` | Authenticated owner scope | None | Requires enquiry snapshot repository/provider. |
| `POST /api/payments/credit-card-bill-2/payments` | Authenticated | `{ "enquiryId": "..." }` and `Idempotency-Key` | Provider-independent boundary only; first create is HTTP 201, replay HTTP 200. |

No payout or bill provider details are assumed. Durable records and repository boundaries exist, but the default providers fail with HTTP 503 `NOT_CONFIGURED`; no provider operation returns mock success. Bill enquiry references are stored only as hashes. Payout beneficiary rows accept provider references and masked display values, not raw bank details.

## Status, charges, and callback boundary

AquaPay payment status is `PENDING`, `UNKNOWN`, `SUCCESS`, or `FAILED`; initiation status is separately `PENDING`, `TXN`, `TXF`, or `UNKNOWN`. Settlement status is distinct: `UNCONFIRMED`, `SETTLEMENT_PENDING`, `SETTLED`, or `SETTLEMENT_FAILED`. Intended settlement mode is `T_PLUS_1` when instant charge is absent and `INSTANT` when configured; that does not mark settlement as complete and does not establish NixaSoft instant-transfer support.

Charges and each configured ancestor-level commission are calculated independently from the original amount. Service and optional instant charge apply to the initiator. Commission calculation does not itself post commission. Ancestors are resolved through `users.parent_id` and each direct role edge is checked against `role_hierarchy`; cycles and invalid edges fail closed. The current implementation treats a configured hierarchy level as eligible; confirm this policy and any role exclusions before enabling posting. The initiator is rejected as an ancestor. Integer-paise arithmetic rejects fractional-paisa results until a rounding rule is approved.

If enabled after NixaSoft confirms its contract, callback processing requires a provider authenticator. Its repository boundary must atomically correlate `requestId`, stored provider `orderId`, and original amount; persist a PII-protected event record with verification/processing metadata; deduplicate events; and apply monotonic transitions. `FAILED` cannot later become `SUCCESS` without an approved correction procedure. The current API has no callback route, and no callback or redirect posts wallet credit or commissions. Reconciliation remains a repository/job boundary; no provider status enquiry is assumed.

## PDF reference availability and unresolved decisions

No `paymentGatewayIntegration.pdf` was found in the current repository. The lifecycle requirements in the prompts were used as the available reference. Confirm with NixaSoft: callback method/content type/headers/authentication/acknowledgement/retries; reversal rules; whether SUCCESS means captured or settled funds; dedicated versus generic webhook; Premium PG 3 pay-in status enquiry and refunds; duplicate request-ID behavior; and `txn_id` ownership. Team decisions are still needed for payer identity rules, eligible ancestors, charge collection, rounding/tax/caps/minimums, default scheme policy, and actual instant settlement capability.
