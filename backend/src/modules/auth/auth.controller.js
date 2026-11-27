import authService from "./auth.service.js";
import asyncHandler from "../../utils/asyncHandler.js";

const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.validatedBody);
  res.status(201).json({ success: true, message: "Registration successful", data });
});

const verifyLoginOtp = asyncHandler(async (req, res) => {
  const data = await authService.verifyLoginOtp(req.validatedBody);
  res.status(200).json({ success: true, message: "Login successful", data });
});

const resendLoginOtp = asyncHandler(async (req, res) => {
  const data = await authService.resendLoginOtp(req.validatedBody);
  res.status(200).json({ success: true, message: "Login OTP regenerated", data });
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.validatedBody);
  res.status(200).json({ success: true, message: data.otpRequired ? "OTP verification required" : "Login successful", data });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const data = await authService.getCurrentUser(req.user.id);
  res.status(200).json({ success: true, message: "User retrieved successfully", data });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.validatedBody);
  const data = process.env.APP_ENV === "development" && result.developmentResetToken
    ? { resetToken: result.developmentResetToken }
    : null;
  res.status(200).json({ success: true, message: result.message, data });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.validatedBody);
  res.status(200).json({ success: true, message: result.message, data: null });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user?.id, req.validatedBody);
  res.status(200).json({ success: true, message: result.message, data: null });
});

export { register, login, verifyLoginOtp, resendLoginOtp, getCurrentUser, forgotPassword, resetPassword, changePassword };
export default { register, login, verifyLoginOtp, resendLoginOtp, getCurrentUser, forgotPassword, resetPassword, changePassword };
