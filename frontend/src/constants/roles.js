/** PayTeam has two application roles: Admin (AD) and User/Customer (US). */
export const ROLES = [
  { id: 1, slug: "AD", name: "Admin", isAdmin: true },
  { id: 2, slug: "US", name: "User", isAdmin: false },
];

export const NORMAL_USER_ROLES = ROLES.filter((role) => !role.isAdmin);

export function isAdminRole(roleOrUser) {
  if (!roleOrUser) return false;
  if (typeof roleOrUser === "object") {
    const roleId = Number(roleOrUser.role_id || roleOrUser.id);
    const slug = String(roleOrUser.role_slug || roleOrUser.slug || "").trim().toUpperCase();
    const name = String(roleOrUser.role_name || roleOrUser.name || "").trim().toUpperCase();
    return roleId === 1 || slug === "AD" || name === "ADMIN";
  }
  return ["1", "AD", "ADMIN"].includes(String(roleOrUser).trim().toUpperCase());
}

export function isNormalUserRole(roleOrUser) {
  if (!roleOrUser || isAdminRole(roleOrUser)) return false;
  if (typeof roleOrUser === "object") {
    const roleId = Number(roleOrUser.role_id || roleOrUser.id);
    const slug = String(roleOrUser.role_slug || roleOrUser.slug || "").trim().toUpperCase();
    const name = String(roleOrUser.role_name || roleOrUser.name || "").trim().toUpperCase();
    return roleId === 2 || slug === "US" || name === "USER" || name === "CUSTOMER";
  }
  return ["2", "US", "USER", "CUSTOMER"].includes(String(roleOrUser).trim().toUpperCase());
}

export function getRoleMeta(roleOrUser) {
  if (!roleOrUser) return null;
  const roleId = typeof roleOrUser === "object"
    ? Number(roleOrUser.role_id || roleOrUser.id)
    : Number(roleOrUser);
  if (roleId) return ROLES.find((role) => role.id === roleId) || null;
  const slug = typeof roleOrUser === "object"
    ? String(roleOrUser.role_slug || roleOrUser.slug || roleOrUser.role_name || roleOrUser.name || "").trim().toUpperCase()
    : String(roleOrUser).trim().toUpperCase();
  if (["AD", "ADMIN"].includes(slug)) return ROLES[0];
  if (["US", "USER", "CUSTOMER"].includes(slug)) return ROLES[1];
  return null;
}

export default { ROLES, NORMAL_USER_ROLES, isAdminRole, isNormalUserRole, getRoleMeta };
