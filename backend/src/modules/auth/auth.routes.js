import { Router } from "express";
import * as controller from "./auth.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { rateLimit } from "../../middlewares/authRateLimit.middleware.js";
import {
  validateRegister,
  validateLoginOtp,
  validateResendLoginOtp,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} from "./auth.validator.js";

const router = Router();

router.post("/register", rateLimit("register"), validateRegister, controller.register);
router.post("/login", rateLimit("login"), validateLogin, controller.login);
router.post("/login/verify-otp", rateLimit("loginOtp"), validateLoginOtp, controller.verifyLoginOtp);
router.post("/login/resend-otp", rateLimit("loginOtpResend"), validateResendLoginOtp, controller.resendLoginOtp);
router.post(
  "/forgot-password",
  rateLimit("forgotPassword"),
  validateForgotPassword,
  controller.forgotPassword
);
router.post(
  "/reset-password",
  rateLimit("resetPassword"),
  validateResetPassword,
  controller.resetPassword
);
router.get("/me", requireAuth, controller.getCurrentUser);
router.post(
  "/change-password",
  requireAuth,
  rateLimit("changePassword"),
  validateChangePassword,
  controller.changePassword,
);

export { router };
export default router;
