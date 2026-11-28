import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChartNoAxesCombined, ChevronLeft, LogOut, Menu, Moon, PanelLeftOpen, Search, Sun, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminNavigationGroups } from "../../features/admin/adminNavigation";
import { preloadAdminPage } from "../../features/admin/adminPageLoaders";
import { services, workspaceLinks } from "./catalog";
import "@fontsource-variable/manrope";
import "./workspace.css";
import "./workspace-pages.css";

function preferredTheme() {
  try { return localStorage.getItem("payteam.workspace.theme") === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

function WorkspaceDialog({ title, close, drawer, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const reduced = useReducedMotion();
  return <motion.dialog initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 4 }} transition={{ duration: reduced ? 0 : .15, ease: [0.2, 0.75, 0.25, 1] }} className={drawer ? "gw-dialog gw-drawer" : "gw-dialog"} ref={ref}
    aria-labelledby={id} onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === ref.current) {
      const rect = ref.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    } }}>
    <div className="gw-dialog-title"><h2 id={id}>{title}</h2><button aria-label="Close dialog" onClick={close}><X size={18}/></button></div>
    {children}
  </motion.dialog>;
}

export default function GlassWorkspace({ admin = false, permittedRoles = [], children }) {
  const { user, logout, adminLogout } = useAuth();
  const location = useLocation();
  const reduced = useReducedMotion();
  const mainRef = useRef(null);
  const [theme, setTheme] = useState(preferredTheme);
  const [collapsed, setCollapsed] = useState(false);
  const [dialog, setDialog] = useState("");
  const [search, setSearch] = useState("");
  const base = admin ? "/admin" : "/user";
  const links = admin ? [] : workspaceLinks(false);
  const adminPath = location.pathname.toLowerCase().replace(/\/+$/, "");
  const inUsers = adminPath === "/admin/users" || adminPath.startsWith("/admin/users/");
  const roleId = new URLSearchParams(location.search).get("roleId");
  const activeRole = adminPath === "/admin/users" && permittedRoles.find(role => String(role.id) === roleId);
  const searchHint = admin ? "Find a customer directory, service or page…" : "Find a service, payment or page…";
  const overview = location.pathname === base + "/dashboard";
  const searchItems = dialog !== "search" ? [] : admin ? [
    ...adminNavigationGroups.flatMap(({ items }) => items.map(({ label, path, icon, unavailable }) =>
      ({ label, to: path, icon, locked: unavailable }))),
    { label: "Reports", to: "/admin/reports", icon: ChartNoAxesCombined },
    { label: "My profile", to: "/admin/profile", icon: UserRound },
  ] : [
    ...links,
    ...services.filter(({ name }) => name !== "Wallet").map(({ name, icon }) =>
      ({ label: name, to: base + "/dashboard#service-" + encodeURIComponent(name), icon, locked: true })),
  ];
  const results = searchItems.filter(item => item.label.toLowerCase().includes(search.trim().toLowerCase()));
  function openSearch() { setSearch(""); setDialog("search"); }
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("payteam.workspace.theme", next); } catch { /* Theme still applies in this tab. */ }
  }
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!location.hash) return;
    const timer = window.setTimeout(() => {
      const node = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      node?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "instant" : "smooth" });
      node?.focus({ preventScroll: true });
    }, 220);
    return () => clearTimeout(timer);
  }, [location.key, location.hash, reduced]);
  useEffect(() => {
    if (!admin || location.hash) return;
    mainRef.current?.scrollTo({ top: 0 });
  }, [admin, location.pathname, location.hash]);
  function nav(drawer) {
    function renderLink({ label, to, icon: Icon, active }) {
      const preload = admin && (to === "/admin/users" || to === "/admin/kyc") ? () => preloadAdminPage(to) : undefined;
      return <Link key={to} to={to} title={label} aria-label={label} aria-current={active ? "page" : undefined}
        onPointerEnter={preload} onFocus={preload} onClick={() => setDialog("")}>
        {active && (admin ? <span className="gw-active-pill" /> :
          <motion.span className="gw-active-pill" layoutId={drawer ? "drawer-selection" : "workspace-selection"} transition={{ duration: reduced ? 0 : .26 }}/>)}
        {Icon && <span className="gw-nav-icon"><Icon size={20}/></span>}
        <span className="gw-nav-label">{label}</span>
      </Link>;
    }

    if (admin) {
      return <nav id={drawer ? undefined : "admin-sidebar-navigation"} aria-label="Admin navigation" className="gw-admin-nav">{adminNavigationGroups.map(({ label, items }) => (
        <div className="gw-admin-nav-group" role="group" aria-label={label || "Overview"} key={label || "Overview"}>
          {label && <h2 className="gw-admin-nav-heading">{label}</h2>}
          {items.map(({ label: itemLabel, path, icon }) => renderLink({
            label: itemLabel, to: path, icon,
            active: path === "/admin/users" ? inUsers && !activeRole : adminPath === path,
          }))}
          {label === "Customer Management" && inUsers && permittedRoles.length > 0 && (
            <div className="gw-admin-role-links" role="group" aria-label="Permitted role directories">
              {permittedRoles.map((role) => renderLink({
                label: `${role.name} directory`,
                to: `/admin/users?roleId=${encodeURIComponent(role.id)}`,
                active: activeRole === role,
              }))}
            </div>
          )}
        </div>
      ))}</nav>;
    }

    return <nav aria-label="Customer navigation">{links.map(({ label, to, icon }) => {
      const [path, hash] = to.split("#");
      const active = hash ? overview && (location.hash === "#" + hash || (hash === "services" && location.hash.startsWith("#service-")))
        : location.pathname === path.split("?")[0] && !location.hash || label === "KYC" && location.pathname.startsWith("/user/kyc");
      return renderLink({ label, to, icon, active });
    })}</nav>;
  }
  const brand = <Link className="gw-brand" to={base + "/dashboard"} aria-label="PayTeam dashboard">
    <span className="gw-logo"><img src="/payteam-mark.svg" alt=""/></span>
    <span><strong>PayTeam</strong><small>{admin ? "Admin workspace" : "Payments for everyday life"}</small></span>
  </Link>;
  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const adminSignOut = <button type="button" className="gw-chip gw-admin-sign-out" aria-label="Sign out" title="Sign out" onClick={adminLogout}>
    <LogOut size={18} aria-hidden="true"/><span className="gw-nav-label">Sign Out</span>
  </button>;
  const compactClass = collapsed ? " gw-compact" : "";
  const workspace = <>
      <aside className="gw-sidebar">
        {admin && <div className="gw-admin-sidebar-top">
          {brand}
          <button type="button" className="gw-chip gw-admin-collapse" aria-label={collapseLabel} title={collapseLabel}
            aria-expanded={!collapsed} aria-controls="admin-sidebar-navigation" onClick={() => setCollapsed(value => !value)}>
            {collapsed ? <PanelLeftOpen size={17}/> : <ChevronLeft size={17}/>}
          </button>
        </div>}
        {nav(false)}
        {admin ? <div className="gw-admin-sidebar-footer">{adminSignOut}</div> :
          <button className="gw-collapse" aria-label={collapseLabel} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen size={17}/> : <ChevronLeft size={17}/>}<span className="gw-nav-label">Collapse</span>
          </button>}
      </aside>
      <header className="gw-header">
        <button className="gw-round gw-menu" aria-label="Open navigation" onClick={() => setDialog("nav")}><Menu/></button>
        {brand}
        <button className="gw-search" aria-label={"Search workspace. " + searchHint} onClick={openSearch}><i className="gw-orb"/><span>{searchHint}</span><Search size={21}/></button>
        <div className="gw-actions"><button className="gw-round" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun/> : <Moon/>}</button>
        {admin ? <Link className="gw-round" to="/admin/profile" aria-label="My profile" title="My profile"><UserRound/></Link>
          : <button className="gw-round" aria-label="Account menu" onClick={() => setDialog("account")}><UserRound/></button>}</div>
      </header>
      <main className="gw-main" id="workspace-main" ref={mainRef}>
        {admin ? <div className={overview ? "gw-overview" : "gw-internal"}>{children}</div> :
        <AnimatePresence mode="wait" initial={false}>
        <motion.div key={location.pathname} className={overview ? "gw-overview" : "gw-internal"}
          initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "none", transition: { duration: .32 } }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : .14 } }} style={{ filter: "none" }}
        >{children}</motion.div></AnimatePresence>}
      </main>
  </>;
  return <MotionConfig reducedMotion="user"><div className={admin ? "gw gw-admin-shell" + compactClass : "gw"} data-theme={theme}>
    {admin ? workspace : <div className={"gw-frame" + compactClass}>{workspace}</div>}
    <AnimatePresence>{dialog === "nav" && <WorkspaceDialog key="nav" title="Navigation" drawer close={() => setDialog("")}>
      {nav(true)}
      {admin && <div className="gw-admin-sidebar-footer">{adminSignOut}</div>}
    </WorkspaceDialog>}
    {dialog === "search" && <WorkspaceDialog key="search" title="Search workspace" close={() => setDialog("")}>
      <label className="gw-search-input"><Search size={18}/><input autoFocus aria-label="Search pages and services" placeholder="Search pages and services" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="gw-results">{results.map(({ label, to, icon: Icon, locked }) => <Link to={to} key={label} onClick={() => setDialog("")}><Icon size={17}/>{label}<small>{locked ? "Unavailable" : <ArrowUpRight size={14}/>}</small></Link>)}
      {!results.length && <p>No matching pages or services.</p>}</div>
    </WorkspaceDialog>}
    {!admin && dialog === "account" && <WorkspaceDialog key="account" title={user?.name || "Account"} close={() => setDialog("")}>
      <div className="gw-results"><Link to={base + "/profile"} onClick={() => setDialog("")}><UserRound size={18}/>My profile</Link>
      <button onClick={logout}><LogOut size={18}/>Sign out</button></div>
    </WorkspaceDialog>}</AnimatePresence>
  </div></MotionConfig>;
}
