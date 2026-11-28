
import adminSetupMiddleware from "./adminSetup.middleware.js";
import { Router } from "express";
import {
  validateAdminInput,
  createAdminController,
} from "./admin.controller.js";
import adminKycRoutes from "./kyc/adminKyc.routes.js";
import catalogueRoutes from "../catalogue/catalogue.routes.js";
import schemeManagementRoutes from "../scheme-management/schemeManagement.routes.js";
import { requireActiveAdmin } from "../../middlewares/auth.middleware.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { getIdtoErrors, requestLatency } from "./platformHealth/requestLatency.js";
import { getBusinessPerformance } from "./businessPerformance/businessPerformance.js";
import { getBusinessInsights } from "./businessPerformance/businessInsights.js";
import { getAccountSummary } from "./businessPerformance/accountSummary.js";

const router = Router();

router.get("/account-summary", requireActiveAdmin, async (_req, res, next) => {
  try {
    const data = await getAccountSummary();
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/business-insights", requireActiveAdmin, async (req, res, next) => {
  try {
    const data = await getBusinessInsights(req.query);
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/business-performance", requireActiveAdmin, async (req, res, next) => {
  try {
    const data = await getBusinessPerformance(req.query);
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/platform-health", requireActiveAdmin, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(new ApiResponse(200, { apiLatency: requestLatency.snapshot(), idtoErrors: getIdtoErrors() }));
});

// Existing admin creation route
router.post(
  "/create",
  adminSetupMiddleware.verifyAdminSetupKey,
  validateAdminInput,
  createAdminController
);

// Admin KYC routes
router.use("/kyc", adminKycRoutes);
if (process.env.ADMIN_CATALOGUE_ENABLED === "true") {
  router.use("/catalogue", catalogueRoutes);
}
if (process.env.ADMIN_SCHEME_MANAGEMENT_ENABLED === "true") {
  router.use("/schemes", schemeManagementRoutes);
}

export { router };
export default router;
