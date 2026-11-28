import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import authModel from "../auth/auth.model.js";
import ApiError from "../../utils/ApiError.js";
import basicDetailsRoutes from "./basic-details/basicDetails.routes.js";
import statusRoutes from "./status/status.routes.js";
import agreementRoutes from "./agreement/agreement.routes.js";
import submissionRoutes from "./submission/submission.routes.js";
import { getLiveKycConfig } from "./liveKycConfig.js";

const router = Router();
const config = getLiveKycConfig();
router.use(basicDetailsRoutes);
router.use(statusRoutes);
router.get("/capabilities", requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store").json({ success: true, data: {
    aadhaar: Boolean(config?.aadhaar), pan: Boolean(config?.pan), bank: Boolean(config?.bank), media: Boolean(config?.media), agreement: Boolean(config?.agreement),
    consentVersion: config?.version || null, disclosures: config?.disclosures || null, mediaRetention: config?.mediaRetention || null, videoConsentScript: config?.videoConsentScript || null,
  } });
});

if (config) {
  const { default: aadhaarRoutes } = await import("./document-verification/aadhaar/aadhaar.routes.js");
  const { default: digilockerRoutes } = await import("./document-verification/digilocker/digilocker.routes.js");
  // Callback is intentionally outside bearer authentication; its single-use state binds the session.
  router.use(["/digilocker/aadhaar", "/pan", "/bank-details", "/media"], requireAuth, async (req, res, next) => {
    try {
      if (await authModel.isAdmin(req.user.id)) return next(new ApiError(403, "Customer account required", [], "FORBIDDEN"));
      if (req.method !== "GET" && req.originalUrl.split("?")[0] !== "/api/kyc/media/restart" && req.get("X-KYC-Consent-Version") !== config.version) {
        return next(new ApiError(400, "Review and accept the current KYC disclosure before proceeding", [], "CONSENT_REQUIRED"));
      }
      return next();
    } catch { return next(new ApiError(503, "KYC authorization unavailable", [], "SERVICE_UNAVAILABLE")); }
  });
  router.use(aadhaarRoutes, digilockerRoutes);
  if (config.pan) router.use((await import("./document-verification/pan/pan.routes.js")).default);
  if (config.bank) router.use((await import("./bank-details/bankDetails.routes.js")).default);
  if (config.media) router.use((await import("./media/media.routes.js")).default);
}
router.use(agreementRoutes);
router.use(submissionRoutes);
export { router };
export default router;
