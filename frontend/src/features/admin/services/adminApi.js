import api from "../../../api/axios";
import { authenticateWithMe, getCurrentUser } from "../../../api/auth.api";
import { isAdminRole } from "../../../constants/roles";

/**
 * Admin Authentication & Backend-Backed API Service
 * Exclusively provides functionality backed by real backend endpoints:
 * - Authentication: POST /api/auth/login, GET /api/auth/me
 * - User Management: GET /api/users, POST /api/users, PATCH /api/users/:id, GET /api/users/:id
 */

export function isAdminUser(user) {
  return isAdminRole(user);
}

// 1. Admin Authentication Flow
export const adminLogin = async ({ identifier, password }) => {
  // Use existing backend auth endpoint POST /api/auth/login + GET /api/auth/me
  const { accessToken, user } = await authenticateWithMe({
    identifier: identifier.trim(),
    password,
  });

  // Verify that the authenticated role is an authorized Admin role
  if (!isAdminUser(user)) {
    // Clear any temporary tokens/session
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("adminUser");

    throw new Error(
      "You are not authorized to access the Admin Panel. Please use the User Login."
    );
  }

  // Store credentials securely in localStorage
  if (accessToken) {
    localStorage.setItem("accessToken", accessToken);
  }
  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("adminUser", JSON.stringify(user));
  }

  return { success: true, data: { accessToken, user } };
};

export const getAdminProfile = async () => {
  return getCurrentUser();
};

export const adminLogout = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("adminUser");
};

// 2. Real Backend Users Management
export const fetchBackendUsers = async (params = {}, { signal } = {}) => {
  const response = await api.get("/users", { params, signal });
  return response.data;
};

export async function fetchAccountSummary(signal) {
  const { data } = await api.get("/admin/account-summary", { signal });
  const summary = data?.data;
  if (!["approved", "rejected", "awaitingReview", "total", "active"].every(key => Number.isInteger(summary?.[key]))) {
    throw new Error("Invalid account summary");
  }
  return summary;
}

export async function fetchPlatformHealth(signal) {
  const { data } = await api.get("/admin/platform-health", { signal });
  const latency = data?.data?.apiLatency;
  if (!latency || (latency.p95Ms !== null && !Number.isFinite(latency.p95Ms)) ||
      !Number.isInteger(latency.sampleCount) || !Number.isInteger(latency.windowMinutes) ||
      !Array.isArray(latency.history)) {
    throw new Error("Invalid platform health response");
  }
  return data.data;
}

export async function fetchBusinessPerformance(params, signal) {
  const { data } = await api.get("/admin/business-performance", { params, signal });
  const metrics = data?.data;
  if (!Number.isInteger(metrics?.signups?.current) || !metrics.walletBalance) {
    throw new Error("Invalid business performance response");
  }
  return metrics;
}

export async function fetchBusinessInsights(params, signal) {
  const { data } = await api.get("/admin/business-insights", { params, signal });
  const insights = data?.data;
  if (!Number.isInteger(insights?.kycFunnel?.totalCases) || !Number.isInteger(insights.kycFunnel.approvedCases) ||
      !Array.isArray(insights.kycFunnel.steps) || !Number.isInteger(insights.activeCustomers) ||
      !Number.isInteger(insights.totalCustomers)) {
    throw new Error("Invalid business insights response");
  }
  return insights;
}


export const fetchBackendDescendantRoles = async () => {
  const response = await api.get("/users/roles/descendants");
  return response.data;
};

export const fetchBackendUserById = async (id) => {
  const response = await api.get(`/users/${id}`);
  return response.data;
};

export const createBackendUser = async (userData) => {
  const response = await api.post("/users", userData);
  return response.data;
};

export const updateBackendUser = async (id, userData) => {
  const response = await api.patch(`/users/${id}`, userData);
  return response.data;
};

export const resetBackendUserPassword = async (id, { newPassword, confirmPassword }) => {
  const response = await api.post(`/users/${id}/reset-password`, { newPassword, confirmPassword });
  return response.data;
};

export default {
  adminLogin,
  getAdminProfile,
  adminLogout,
  isAdminUser,
  fetchBackendUsers,
  fetchBackendDescendantRoles,
  fetchBackendUserById,
  createBackendUser,
  updateBackendUser,
  resetBackendUserPassword,
};
