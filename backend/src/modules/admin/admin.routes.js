
import adminSetupMiddleware from "./adminSetup.middleware.js";
import { Router } from "express";
import {
  validateAdminInput,
  createAdminController,
} from "./admin.controller.js";
import adminKycRoutes from "./kyc/adminKyc.routes.js";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { getIdtoErrors, requestLatency } from "./platformHealth/requestLatency.js";
import { getBusinessPerformance } from "./businessPerformance/businessPerformance.js";
import { getBusinessInsights } from "./businessPerformance/businessInsights.js";
import { getAccountSummary } from "./businessPerformance/accountSummary.js";

const router = Router();

router.get("/account-summary", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const data = await getAccountSummary();
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/business-insights", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = await getBusinessInsights(req.query);
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/business-performance", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = await getBusinessPerformance(req.query);
    res.set("Cache-Control", "no-store").json(new ApiResponse(200, data));
  } catch (error) {
    next(error);
  }
});

router.get("/platform-health", requireAuth, requireAdmin, (_req, res) => {
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

export { router };
export default router;
