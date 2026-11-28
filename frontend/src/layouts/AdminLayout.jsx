import { useState } from "react";
import AdminDashboardPage from "../pages/dashboard/AdminDashboardPage";
import GlassWorkspace from "../components/workspace/GlassWorkspace";
import "../features/admin/components/adminDashboardGlass.css";

/**
 * Admin Layout component
 * Exclusively provides the admin shell for authorized Admin users.
 */
export function AdminLayout() {
  const [permittedRoles, setPermittedRoles] = useState([]);
  return (
    <GlassWorkspace admin permittedRoles={permittedRoles}>
      <AdminDashboardPage onPermittedRolesChange={setPermittedRoles} />
    </GlassWorkspace>
  );
}

export default AdminLayout;
