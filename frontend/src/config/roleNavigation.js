/** Navigation is limited to PayTeam's Admin and Customer roles. */
export const ROLE_NAVIGATION = {
  AD: [
    { id: "admin-dashboard", label: "Dashboard", path: "/admin/dashboard", icon: "LayoutDashboard" },
    { id: "admin-kyc", label: "KYC Management", path: "/admin/kyc", icon: "ShieldCheck" },
    { id: "admin-reports", label: "Reports", path: "/admin/reports", icon: "BarChart3" },
    { id: "admin-settings", label: "Settings", path: "/admin/settings", icon: "Settings" },
  ],
  US: [
    { id: "user-dashboard", label: "Home", path: "/user/dashboard", icon: "LayoutDashboard" },
    { id: "user-kyc", label: "KYC", path: "/kyc", icon: "ShieldCheck" },
    { id: "user-profile", label: "Profile", path: "/user/profile", icon: "User" },
    { id: "user-settings", label: "Settings", path: "/user/settings", icon: "Settings" },
  ],
};

export function getRoleNavigation(userOrRole) {
  let slug = "";
  if (typeof userOrRole === "object" && userOrRole) {
    slug = String(userOrRole.role_slug || userOrRole.slug || "").trim().toUpperCase();
    if (!slug) slug = Number(userOrRole.role_id || userOrRole.id) === 1 ? "AD" : "US";
  } else {
    slug = String(userOrRole || "US").trim().toUpperCase();
  }
  if (["ADMIN", "SUPER ADMIN"].includes(slug)) slug = "AD";
  if (["USER", "CUSTOMER"].includes(slug)) slug = "US";
  return ROLE_NAVIGATION[slug] || [];
}

export default ROLE_NAVIGATION;
