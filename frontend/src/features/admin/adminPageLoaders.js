export const loadAdminKycReview = () => import("./components/AdminKycReview");
export const loadAdminUserTable = () => import("./components/AdminUserTable")
  .then(module => ({ default: module.AdminUserTable }));

export function preloadAdminPage(path) {
  const load = path === "/admin/kyc" ? loadAdminKycReview :
    path === "/admin/users" ? loadAdminUserTable : null;
  // React.lazy still handles errors on actual navigation.
  load?.().catch(() => {});
}
