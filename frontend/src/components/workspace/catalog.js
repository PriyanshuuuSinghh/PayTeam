import { ArrowLeftRight, ChartNoAxesCombined, CreditCard, Droplet, House, IdCard, Layers3, LayoutGrid, Radio, Settings, Smartphone, Tv, UserRound, Users, Wallet, Wifi, Zap } from "lucide-react";

export const services = [
  { name: "BBPS", icon: Layers3, color: "violet" },
  { name: "Mobile recharge", icon: Smartphone, color: "green" },
  { name: "DTH", icon: Tv, color: "violet" },
  { name: "Electricity", icon: Zap, color: "amber" },
  { name: "Water", icon: Droplet, color: "aqua" },
  { name: "Broadband", icon: Wifi, color: "aqua" },
  { name: "Wallet", icon: Wallet, color: "green" },
  { name: "Credit card bills", icon: CreditCard, color: "violet" },
  { name: "FASTag", icon: Radio, color: "amber" },
];

export function workspaceLinks(admin, customerDirectory) {
  const base = admin ? "/admin" : "/user";
  const dashboard = base + "/dashboard";
  return [
    { label: "Dashboard", to: dashboard, icon: House },
    admin ? { label: "Customers", to: customerDirectory || "/admin/users", icon: Users }
      : { label: "Profile", to: base + "/profile", icon: UserRound },
    { label: "Services", to: dashboard + "#services", icon: LayoutGrid },
    { label: "KYC", to: admin ? base + "/kyc" : "/kyc", icon: IdCard },
    admin ? { label: "Reports", to: base + "/reports", icon: ChartNoAxesCombined }
      : { label: "Transactions", to: dashboard + "#transactions", icon: ArrowLeftRight },
    { label: "Settings", to: base + "/settings", icon: Settings },
  ];
}
