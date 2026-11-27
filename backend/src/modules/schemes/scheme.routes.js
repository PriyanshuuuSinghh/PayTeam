import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware.js";
import { createSchemeService } from "./scheme.service.js";
import { createMysqlPaymentRepository } from "../payments/mysqlPayment.repository.js";

function createSchemeRouter({ repository = createMysqlPaymentRepository() } = {}) {
  const router = Router();
  const service = createSchemeService(repository);
  const send = (fn, status = 200, message = "Success") => asyncHandler(async (req, res) => res.status(status).json(new ApiResponse(status, await fn(req), message)));

  router.get("/", requireAuth, send((req) => service.listForUser(req.user.id)));
  router.get("/admin", requireAuth, requireAdmin, send(() => service.listAll()));
  router.get("/services", requireAuth, send(() => service.listServices()));
  router.post("/", requireAuth, requireAdmin, send((req) => service.create(req.body || {}), 201, "Scheme created"));
  router.patch("/:schemeId", requireAuth, requireAdmin, send((req) => service.rename(req.params.schemeId, req.body || {})));
  router.put("/:schemeId/default", requireAuth, requireAdmin, send((req) => service.setDefault(req.params.schemeId)));
  router.put("/:schemeId/users/:userId", requireAuth, requireAdmin, send((req) => service.assign(req.user.id, req.params.userId, req.params.schemeId)));
  router.get("/me", requireAuth, send((req) => service.getAssigned(req.user.id)));
  router.get("/me/services/:serviceCode/operators/:operator", requireAuth, send((req) => service.getConfiguration(req.user.id, req.params.serviceCode, req.params.operator)));
  router.put("/:schemeId/services/:serviceCode/operators/:operator/configuration", requireAuth, requireAdmin, send((req) => service.setConfiguration(req.params.schemeId, req.params.serviceCode, req.params.operator, req.body || {}, req.user.id)));

  return router;
}

export { createSchemeRouter };
export default createSchemeRouter();
