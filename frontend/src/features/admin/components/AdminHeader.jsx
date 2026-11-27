import React from "react";
import { ChevronDown, ChevronRight, LogOut, Menu, RefreshCw, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

const iconButton = "size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-[#354875] hover:bg-[#e9eefb] focus-visible:outline-2 focus-visible:outline-blue-600";

export function AdminHeader({
  pageTitle, breadcrumbs,
  sidebarCollapsed, setSidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen,
  onRefresh, isRefreshing, lastUpdated, refreshLabel = "Refresh account data",
}) {
  const navigate = useNavigate();
  const { user, isAdmin, adminLogout } = useAuth();
  const admin = isAdmin ? user : null;
  const initials = admin?.name?.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-2 border-b border-[#e5edf8] bg-white/95 px-3 py-2.5 backdrop-blur-sm sm:gap-4 sm:px-5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          className={`${iconButton} hidden md:grid`}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="admin-sidebar"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className={`${iconButton} grid md:hidden`}
          aria-label="Open admin navigation"
          aria-haspopup="dialog"
          aria-expanded={mobileSidebarOpen}
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>

        <div className="min-w-0">
          <nav aria-label="Breadcrumb">
            <ol className="flex min-w-0 items-center gap-1 text-xs leading-5 text-[#354875]">
              {breadcrumbs.map(({ label, to }, index) => (
                <li key={index} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-slate-400" />}
                  {to ? (
                    <Link to={to} title={label} className="truncate rounded-sm hover:text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">
                      {label}
                    </Link>
                  ) : (
                    <span title={label} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} className="truncate">{label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <p title={pageTitle} className="truncate text-base font-semibold leading-6 tracking-tight text-slate-950 sm:text-lg">
            {pageTitle}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {onRefresh && (
          <div className="flex items-center gap-2 sm:border-r sm:border-[#e5edf8] sm:pr-3">
            {lastUpdated && (
              <span role="status" className="sr-only whitespace-nowrap text-xs font-medium text-[#354875] sm:not-sr-only lg:text-sm">
                Last updated <time dateTime={lastUpdated.toISOString()}>{lastUpdated.toLocaleTimeString()}</time>
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label={refreshLabel}
              aria-busy={isRefreshing}
              title={lastUpdated ? `${refreshLabel} · Last updated ${lastUpdated.toLocaleTimeString()}` : refreshLabel}
              className={`${iconButton} grid bg-[#f4f6fc] disabled:cursor-wait disabled:opacity-60`}
            >
              <RefreshCw aria-hidden="true" className={`size-[18px] ${isRefreshing ? "motion-safe:animate-spin" : ""}`} />
            </button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Admin account menu"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-xl bg-[#f4f6fc] p-1 text-[#354875] hover:bg-[#e9eefb] focus-visible:outline-2 focus-visible:outline-blue-600 sm:pr-2"
          >
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[#405db1] text-sm font-semibold text-white">
              {initials || <UserRound className="size-4" />}
            </span>
            <ChevronDown aria-hidden="true" className="hidden size-4 sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-xl p-1.5">
            {admin && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2.5 py-2">
                    <span className="block break-words text-sm font-semibold text-slate-950">{admin.name || admin.email}</span>
                    {admin.role_name && <span className="mt-0.5 block text-slate-600">{admin.role_name}</span>}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem className="min-h-9 px-2.5" onClick={() => navigate("/admin/profile")}>
              <UserRound aria-hidden="true" /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-9 px-2.5" variant="destructive" onClick={adminLogout}>
              <LogOut aria-hidden="true" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default AdminHeader;
