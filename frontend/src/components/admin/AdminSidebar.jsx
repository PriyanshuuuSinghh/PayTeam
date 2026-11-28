import React, { memo, useCallback, useEffect } from "react";
import { LogOut } from "lucide-react";
import { adminNavigationGroups } from "../../features/admin/adminNavigation";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
function SidebarContents({ compact = false, permittedRoles, onNavigate }) {
  const { adminLogout } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const selectedRoleId = searchParams.get("roleId");
  const row = `admin-glass-nav-link flex min-h-8 min-w-0 w-full items-center gap-2.5 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${compact ? "justify-center" : "px-2.5"}`;

  function signOut() {
    onNavigate();
    toast.info("Signed out successfully from Admin Console");
    adminLogout();
  }

  return (
    <>
      <div className={`flex h-16 shrink-0 items-center ${compact ? "justify-center" : "px-5"}`}>
        <Link to="/admin/dashboard" onClick={onNavigate} aria-label="PayTeam dashboard" className="flex items-center gap-2 rounded-lg">
          <img src="/payteam-mark.svg" alt="" className="size-9 shrink-0" />
          {!compact && <span className="text-xl font-bold tracking-tight text-slate-950">PayTeam</span>}
        </Link>
      </div>

      <nav aria-label="Admin navigation" className="admin-glass-navigation min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2">
        {adminNavigationGroups.map(({ label, items }) => (
          <div key={label ?? "Overview"} className="admin-glass-nav-group border-b py-1.5 first:pt-0 last:border-0">
            {label && !compact && (
              <h2 className="mb-0.5 px-2.5 text-[0.6875rem] font-semibold uppercase leading-5 tracking-wide text-[#4b5871]">{label}</h2>
            )}
            <ul aria-label={label ?? "Overview"} className="space-y-0.5">
              {items.map(({ label: itemLabel, icon: Icon, path }) => {
                const content = (
                  <>
                    <Icon aria-hidden="true" className="size-[17px] shrink-0" />
                    {!compact && <span className="min-w-0 leading-[1.2]">{itemLabel}</span>}
                  </>
                );

                return (
                  <li key={itemLabel}>
                      <NavLink
                        to={path}
                        end={path !== "/admin/users"}
                        onClick={onNavigate}
                        title={itemLabel}
                        aria-label={itemLabel}
                        className={row}
                      >
                        {content}
                      </NavLink>
                    {path === "/admin/users" && !compact && (pathname === path || pathname.startsWith(`${path}/`)) && permittedRoles.length > 0 && (
                      <ul aria-label="Permitted role directories" className="my-1 ml-5 space-y-0.5 border-l border-blue-200 pl-2">
                        {permittedRoles.map((role) => {
                          const selected = pathname === path && selectedRoleId === String(role.id);
                          return (
                            <li key={role.id}>
                              <Link
                                to={`${path}?roleId=${encodeURIComponent(role.id)}`}
                                onClick={onNavigate}
                                aria-current={selected ? "page" : undefined}
                                title={role.name}
                                className="admin-glass-nav-link block wrap-break-word rounded-md px-2 py-1.5 text-sm"
                              >
                                {role.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="admin-glass-nav-group shrink-0 border-t p-2.5">
        <button type="button" onClick={signOut} aria-label="Sign out" title={compact ? "Sign out" : undefined} className={`${row} text-[#293b63] hover:bg-[#eaf0fa]`}>
          <LogOut aria-hidden="true" className="size-[18px] shrink-0" />
          {!compact && "Sign out"}
        </button>
      </div>
    </>
  );
}

export const AdminSidebar = memo(function AdminSidebar({ sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, permittedRoles }) {
  const closeMobile = useCallback(() => setMobileSidebarOpen(false), [setMobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const desktop = window.matchMedia("(min-width: 48rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileSidebarOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  return (
    <>
      <aside id="admin-sidebar" aria-label="PayTeam sidebar" className="admin-glass-rail fixed inset-y-0 left-0 z-40 hidden w-(--admin-sidebar-width) flex-col border-r border-[#e5edf8] bg-[#f4f7fc] transition-[width] duration-200 motion-reduce:transition-none md:flex">
        <SidebarContents compact={sidebarCollapsed} permittedRoles={permittedRoles} onNavigate={closeMobile} />
      </aside>
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" overlayClassName="admin-glass-drawer-overlay" className="admin-glass-drawer gap-0 border-[#e5edf8] data-[side=left]:w-[min(17rem,88vw)]">
          <SheetTitle className="sr-only">PayTeam admin navigation</SheetTitle>
          <SidebarContents permittedRoles={permittedRoles} onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
});

export default AdminSidebar;
