import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { createMysqlPaymentRepository } from "./mysqlPayment.repository.js";
import { createPremiumPg3Provider } from "./nixasoftPremiumPg3.provider.js";
import { createAddMoneyService } from "./addMoney.service.js";
import { createProductContracts } from "./productContracts.service.js";
import { createPaymentStatusService } from "./paymentStatus.service.js";
import { invalid } from "./payment.errors.js";
import { isValidEmail, isValidMobile, normalizeMobile, normalizeEmail, normalizeString } from "../../utils/validationHelper.js";
import { createUnavailableAddMoneyConfigurationResolver } from "./addMoneyConfigurationResolver.js";

function validateAddMoney(req) {
  const body = req.body || {};
  if (!body.customer || typeof body.customer !== "object" || Array.isArray(body.customer)) throw invalid("Customer details are required");
  if (!normalizeString(body.customer.name) || body.customer.name.trim().length > 100) throw invalid("A valid customer name is required");
  if (!isValidMobile(body.customer.phone)) throw invalid("A valid customer phone is required");
  if (!isValidEmail(body.customer.email)) throw invalid("A valid customer email is required");
  if (typeof body.amount !== "string" || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(body.amount.trim())) throw invalid("Amount must be a positive INR decimal string");
  const redirectUrl = process.env.NIXASOFT_PREMIUM_PG3_REDIRECT_URL?.trim();
  // The service validates redirect configuration after idempotency lookup. A
  // stored replay must still work if this configuration changes or is absent.
  if (typeof body.operator !== "string" || !body.operator || body.operator.trim() !== body.operator || body.operator.length > 32) throw invalid("A valid operator identifier is required", "OPERATOR_INVALID");
  return { ...body, redirectUrl, customer: { name: body.customer.name.trim(), phone: normalizeMobile(body.customer.phone), email: normalizeEmail(body.customer.email) } };
}

function createPaymentRouter({ repository = createMysqlPaymentRepository(), provider = createPremiumPg3Provider(), configurationResolver = createUnavailableAddMoneyConfigurationResolver(), payoutProvider, billProvider } = {}) {
  const router = Router();
  const addMoney = createAddMoneyService({ repository, provider, configurationResolver });
  const products = createProductContracts(repository, { payoutProvider, billProvider });
  const paymentStatus = createPaymentStatusService(repository);
  const send = (fn, status = 200, message = "Success") => asyncHandler(async (req, res) => res.status(status).json(new ApiResponse(status, await fn(req), message)));
  const sendIdempotentCreate = (fn, message) => asyncHandler(async (req, res) => {
    const data = await fn(req);
    const status = data.replayed ? 200 : 201;
    return res.status(status).json(new ApiResponse(status, data, data.replayed ? "Existing transaction" : message));
  });

  router.post("/add-money", requireAuth, asyncHandler(async (req, res) => {
    const body = validateAddMoney(req);
    const result = await addMoney.initiate({ actorId: req.user.id, customer: body.customer, amount: body.amount, redirectUrl: body.redirectUrl, operator: body.operator, idempotencyKey: req.get("Idempotency-Key") });
    const status = result.replayed ? 200 : 201;
    return res.status(status).json(new ApiResponse(status, result, result.replayed ? "Existing payment transaction" : "Payment initiation accepted"));
  }));
  router.get("/:requestId", requireAuth, send((req) => paymentStatus.getStatus(req.user.id, req.params.requestId)));
  router.post("/payouts", requireAuth, sendIdempotentCreate((req) => products.createPayout({ actorId: req.user.id, beneficiaryId: req.body?.beneficiaryId, amount: req.body?.amount, idempotencyKey: req.get("Idempotency-Key") }), "Payout request accepted"));
  router.get("/payouts/beneficiaries", requireAuth, send((req) => products.listBeneficiaries({ actorId: req.user.id })));
  router.post("/payouts/beneficiaries", requireAuth, send((req) => products.createBeneficiary({ actorId: req.user.id, providerPayload: req.body }), 201));
  router.post("/payouts/beneficiaries/:beneficiaryId/verify", requireAuth, send((req) => products.verifyBeneficiary({ actorId: req.user.id, beneficiaryId: req.params.beneficiaryId })));
  router.get("/payouts/:payoutId", requireAuth, send((req) => products.getPayout({ actorId: req.user.id, payoutId: req.params.payoutId })));
  router.post("/credit-card-bill-2/enquiries", requireAuth, sendIdempotentCreate((req) => products.createBillEnquiry({ actorId: req.user.id, customerReference: req.body?.customerReference, idempotencyKey: req.get("Idempotency-Key") }), "Bill enquiry accepted"));
  router.get("/credit-card-bill-2/enquiries/:enquiryId", requireAuth, send((req) => products.getBillEnquiry({ actorId: req.user.id, enquiryId: req.params.enquiryId })));
  router.post("/credit-card-bill-2/payments", requireAuth, sendIdempotentCreate((req) => products.createBillPayment({ actorId: req.user.id, enquiryId: req.body?.enquiryId, idempotencyKey: req.get("Idempotency-Key") }), "Bill payment accepted"));
  router.get("/credit-card-bill-2/payments/:paymentId", requireAuth, send((req) => products.getBillPayment({ actorId: req.user.id, paymentId: req.params.paymentId })));
  // Provider callback routes are deliberately not registered until transport,
  // authentication, acknowledgement, and retry contracts are confirmed.

  return router;
}

export { createPaymentRouter, validateAddMoney };
export default createPaymentRouter();
