import React, { useEffect } from "react";
import {
  ArrowLeftRight, Bell, ChartNoAxesColumnIncreasing, ClipboardList, LayoutGrid,
  LogOut, MessageCircle, RotateCcw, Settings, ShieldAlert, ShieldCheck,
  SquarePlus, Users, Wallet,
} from "lucide-react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";

const groups = [
  { items: [
    { label: "Dashboard", icon: LayoutGrid, path: "/admin/dashboard" },
    { label: "Analytics", icon: ChartNoAxesColumnIncreasing },
  ] },
  { label: "Customer Management", items: [
    { label: "Users", icon: Users, path: "/admin/users" },
    { label: "KYC Management", icon: ShieldCheck, path: "/admin/kyc" },
  ] },
  { label: "Financial Operations", items: [
    { label: "Transactions", icon: ArrowLeftRight },
    { label: "Wallet Management", icon: Wallet },
    { label: "Withdrawals", icon: SquarePlus },
    { label: "Refunds", icon: RotateCcw },
    { label: "Reconciliation", icon: ClipboardList },
  ] },
  { label: "Business Management", items: [
    { label: "Scheme Manager", icon: Settings },
    { label: "Support & Complaints", icon: MessageCircle },
  ] },
  { label: "System", items: [
    { label: "Notifications", icon: Bell },
    { label: "Risk & Fraud", icon: ShieldAlert },
    { label: "Admin & Roles", icon: Users },
    { label: "Settings", icon: Settings },
  ] },
];

function SidebarContents({ compact = false, permittedRoles, onNavigate }) {
  const { adminLogout } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const selectedRoleId = searchParams.get("roleId");
  const row = `flex min-h-9 min-w-0 w-full items-center gap-2.5 whitespace-nowrap rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${compact ? "justify-center" : "px-2.5"}`;

  function signOut() {
    onNavigate();
    toast.info("Signed out successfully from Admin Console");
    adminLogout();
  }

  return (
    <>
      <div className={`flex h-20 shrink-0 items-center ${compact ? "justify-center" : "px-6"}`}>
        <Link to="/admin/dashboard" onClick={onNavigate} aria-label="PayTeam dashboard" className="flex items-center gap-2 rounded-lg">
          <img src="/payteam-mark.svg" alt="" className="size-9 shrink-0" />
          {!compact && <span className="text-xl font-bold tracking-tight text-slate-950">PayTeam</span>}
        </Link>
      </div>

      <nav aria-label="Admin navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {groups.map(({ label, items }) => (
          <div key={label ?? "Overview"} className="border-b border-blue-100/70 py-2.5 first:pt-0 last:border-0">
            {label && !compact && (
              <h2 title={label} className="mb-1 truncate px-2.5 text-[0.6875rem] font-semibold uppercase leading-5 text-[#42547d]">{label}</h2>
            )}
            <ul aria-label={label ?? "Overview"} className="space-y-0.5">
              {items.map(({ label: itemLabel, icon: Icon, path }) => {
                const content = (
                  <>
                    <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                    {!compact && <span className="min-w-0 truncate">{itemLabel}</span>}
                  </>
                );

                return (
                  <li key={itemLabel}>
                    {path ? (
                      <NavLink
                        to={path}
                        end={path !== "/admin/users"}
                        onClick={onNavigate}
                        title={itemLabel}
                        aria-label={itemLabel}
                        className={({ isActive }) => `${row} ${isActive ? "bg-[#dfe9fb] font-semibold text-blue-800" : "text-[#293b63] hover:bg-[#eaf0fa]"}`}
                      >
                        {content}
                      </NavLink>
                    ) : (
                      <button type="button" disabled className={`${row} cursor-not-allowed text-slate-500`} title={`${itemLabel} — unavailable`} aria-label={`${itemLabel} — unavailable`}>
                        {content}
                      </button>
                    )}
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
                                className={`block truncate rounded-md px-2 py-1.5 text-sm ${selected ? "bg-[#dfe9fb] font-semibold text-blue-800" : "text-[#293b63] hover:bg-[#eaf0fa]"}`}
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

      <div className="shrink-0 border-t border-blue-100/70 p-3">
        <button type="button" onClick={signOut} aria-label="Sign out" title={compact ? "Sign out" : undefined} className={`${row} text-[#293b63] hover:bg-[#eaf0fa]`}>
          <LogOut aria-hidden="true" className="size-[18px] shrink-0" />
          {!compact && "Sign out"}
        </button>
      </div>
    </>
  );
}

export function AdminSidebar({ sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, permittedRoles }) {
  const closeMobile = () => setMobileSidebarOpen(false);

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
      <aside id="admin-sidebar" aria-label="PayTeam sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-(--admin-sidebar-width) flex-col border-r border-[#e5edf8] bg-[#f4f7fc] transition-[width] duration-200 motion-reduce:transition-none md:flex">
        <SidebarContents compact={sidebarCollapsed} permittedRoles={permittedRoles} onNavigate={closeMobile} />
      </aside>
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="gap-0 border-[#e5edf8] bg-[#f4f7fc] data-[side=left]:w-[min(17rem,85vw)]">
          <SheetTitle className="sr-only">PayTeam admin navigation</SheetTitle>
          <SidebarContents permittedRoles={permittedRoles} onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default AdminSidebar;
