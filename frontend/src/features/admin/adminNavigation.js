import {
  ArrowLeftRight, Bell, ChartNoAxesColumnIncreasing, ClipboardList, LayoutGrid,
  MessageCircle, RotateCcw, Settings, ShieldAlert, ShieldCheck,
  SquarePlus, Users, Wallet,
} from "lucide-react";
export const adminNavigationGroups = [
  { items: [
    { label: "Dashboard", icon: LayoutGrid, path: "/admin/dashboard" },
    { label: "Analytics", icon: ChartNoAxesColumnIncreasing, path: "/admin/analytics", unavailable: true },
  ] },
  { label: "Customer Management", items: [
    { label: "Users", icon: Users, path: "/admin/users" },
    { label: "KYC Management", icon: ShieldCheck, path: "/admin/kyc" },
  ] },
  { label: "Financial Operations", items: [
    { label: "Transactions", icon: ArrowLeftRight, path: "/admin/transactions", unavailable: true },
    { label: "Wallet Management", icon: Wallet, path: "/admin/wallet", unavailable: true },
    { label: "Withdrawals", icon: SquarePlus, path: "/admin/withdrawals", unavailable: true },
    { label: "Refunds", icon: RotateCcw, path: "/admin/refunds", unavailable: true },
    { label: "Reconciliation", icon: ClipboardList, path: "/admin/reconciliation", unavailable: true },
  ] },
  { label: "Business Management", items: [
    { label: "Scheme Manager", icon: Settings, path: "/admin/schemes", unavailable: true },
    { label: "Support & Complaints", icon: MessageCircle, path: "/admin/support", unavailable: true },
  ] },
  { label: "System", items: [
    { label: "Notifications", icon: Bell, path: "/admin/notifications", unavailable: true },
    { label: "Risk & Fraud", icon: ShieldAlert, path: "/admin/risk", unavailable: true },
    { label: "Admin & Roles", icon: Users, path: "/admin/roles", unavailable: true },
    { label: "Settings", icon: Settings, path: "/admin/settings", unavailable: true },
  ] },
];

const unavailableModules = [
  ...adminNavigationGroups.flatMap(({ items }) => items.filter((item) => item.unavailable)),
  { label: "Reports", path: "/admin/reports" },
];

export function getUnavailableAdminModule(pathname) {
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, "");
  return unavailableModules.find(({ path }) => path === normalizedPath);
}
