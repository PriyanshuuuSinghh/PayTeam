import api from "./axios";

/**
 * Shared Backend Authentication API Service
 * Exclusively uses real backend endpoints:
 * - POST /api/auth/login
 * - GET /api/auth/me
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 */

export const loginUser = async (credentials) => {
  const response = await api.post("/auth/login", credentials);
  return response.data;
};

export const registerCustomer = async (details) => {
  const response = await api.post("/auth/register", details);
  return response.data;
};

export const getCurrentUser = async (customToken) => {
  const headers = customToken
    ? { Authorization: `Bearer ${customToken}` }
    : undefined;

  const response = await api.get("/auth/me", { headers });
  return response.data;
};

/**
 * Full authentication flow:
 * 1. Authenticate credentials via POST /api/auth/login
 * 2. Retrieve authoritative user & role details via GET /api/auth/me
 */
export const authenticateWithMe = async ({ identifier, password }) => {
  const loginRes = await api.post("/auth/login", {
    identifier: identifier.trim(),
    password,
  });

  if (!loginRes?.data?.success) {
    throw new Error(loginRes?.data?.message || "Authentication failed");
  }

  const data = loginRes.data.data;
  if (data?.otpRequired === true) {
    if (!data.loginToken || data.accessToken) throw new Error("Invalid login challenge");
    return data;
  }
  return verifyAuthenticatedSession(data);
};

async function verifyAuthenticatedSession(data) {
  const accessToken = data?.accessToken;
  if (!accessToken) throw new Error("Authentication token is missing");
  const meRes = await getCurrentUser(accessToken);
  if (!meRes?.success || !meRes?.data?.id) throw new Error("Could not verify the authenticated account");
  return { accessToken, user: meRes.data };
}

export const verifyLoginOtp = async ({ loginToken, otp }) => {
  const response = await api.post("/auth/login/verify-otp", { loginToken, otp });
  if (!response.data?.success) throw new Error(response.data?.message || "OTP verification failed");
  return verifyAuthenticatedSession(response.data.data);
};

export const resendLoginOtp = async (loginToken) => {
  const response = await api.post("/auth/login/resend-otp", { loginToken });
  if (!response.data?.success || !response.data?.data?.loginToken) throw new Error(response.data?.message || "OTP resend failed");
  return response.data.data;
};

export const forgotPassword = async (identifier) => {
  const response = await api.post("/auth/forgot-password", {
    identifier,
  });

  return response.data;
};

export const resetPassword = async ({ token, otp, password }) => {
  const response = await api.post("/auth/reset-password", {
    token,
    otp,
    password,
  });

  return response.data;
};

export const changePassword = async ({ currentPassword, newPassword, confirmPassword }) => {
  const response = await api.post("/auth/change-password", {
    currentPassword,
    newPassword,
    confirmPassword,
  });
  return response.data;
};

export default {
  loginUser,
  registerCustomer,
  verifyLoginOtp,
  resendLoginOtp,
  getCurrentUser,
  authenticateWithMe,
  forgotPassword,
  resetPassword,
  changePassword,
};
