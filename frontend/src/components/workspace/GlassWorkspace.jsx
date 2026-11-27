import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ArrowUpRight, ChevronLeft, LogOut, Menu, Moon, PanelLeftOpen, Search, Sun, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
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
  return <motion.dialog initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 4 }} transition={{ duration: reduced ? 0 : .15 }} className={drawer ? "gw-dialog gw-drawer" : "gw-dialog"} ref={ref}
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
  const [theme, setTheme] = useState(preferredTheme);
  const [collapsed, setCollapsed] = useState(false);
  const [dialog, setDialog] = useState("");
  const [search, setSearch] = useState("");
  const base = admin ? "/admin" : "/user";
  const customer = permittedRoles.find(role => role.slug === "US");
  const links = workspaceLinks(admin, customer && "/admin/users?roleId=" + encodeURIComponent(customer.id));
  const overview = location.pathname === base + "/dashboard";
  const searchItems = [...links, ...(admin ? [{ label: "My profile", to: "/admin/profile", icon: UserRound }, { label: "Transactions", to: "/admin/reports#transactions", icon: ArrowLeftRight }] : []),
    ...services.map(({ name, icon }) => ({ label: name, to: base + "/dashboard#service-" + encodeURIComponent(name), icon, locked: true }))];
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
  function nav(drawer) {
    return <nav aria-label={admin ? "Admin navigation" : "Customer navigation"}>{links.map(({ label, to, icon: Icon }) => {
      const [path, hash] = to.split("#");
      const active = hash ? overview && (location.hash === "#" + hash || (hash === "services" && location.hash.startsWith("#service-")))
        : location.pathname === path.split("?")[0] && !location.hash || label === "KYC" && location.pathname.startsWith("/user/kyc")
        || label === "Customers" && location.pathname.startsWith("/admin/users/");
      return <Link key={label} to={to} title={label} aria-label={label} aria-current={active ? "page" : undefined} onClick={() => setDialog("")}>
        {active && <motion.span className="gw-active-pill" layoutId={drawer ? "drawer-selection" : "workspace-selection"} transition={{ duration: reduced ? 0 : .26 }}/>}
        <span className="gw-nav-icon"><Icon size={20}/></span><span className="gw-nav-label">{label}</span>
      </Link>;
    })}</nav>;
  }
  return <MotionConfig reducedMotion="user"><div className="gw" data-theme={theme}>
    <div className={"gw-frame" + (collapsed ? " gw-compact" : "")}>
      <aside className="gw-sidebar">{nav(false)}
        <button className="gw-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftOpen size={17}/> : <ChevronLeft size={17}/>}<span className="gw-nav-label">Collapse</span>
        </button>
      </aside>
      <header className="gw-header">
        <button className="gw-round gw-menu" aria-label="Open navigation" onClick={() => setDialog("nav")}><Menu/></button>
        <Link className="gw-brand" to={base + "/dashboard"}><span className="gw-logo"><img src="/payteam-mark.svg" alt=""/></span>
          <span><strong>PayTeam</strong><small>{admin ? "Admin workspace" : "Payments for everyday life"}</small></span></Link>
        <button className="gw-search" aria-label="Search workspace" onClick={openSearch}><i className="gw-orb"/><span>{admin ? "Find a customer directory, service or page…" : "Find a service, payment or page…"}</span><Search size={21}/></button>
        <div className="gw-actions"><button className="gw-round" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun/> : <Moon/>}</button>
        <button className="gw-round" aria-label="Account menu" onClick={() => setDialog("account")}><UserRound/></button></div>
      </header>
      <main className="gw-main" id="workspace-main"><AnimatePresence mode="wait" initial={false}>
        <motion.div key={location.pathname} className={overview ? "gw-overview" : "gw-internal"}
          initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "none", transition: { duration: .32 } }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : .14 } }} style={{ filter: "none" }}
        >{children}</motion.div></AnimatePresence></main>
    </div>
    <AnimatePresence>{dialog === "nav" && <WorkspaceDialog key="nav" title="Navigation" drawer close={() => setDialog("")}>{nav(true)}</WorkspaceDialog>}
    {dialog === "search" && <WorkspaceDialog key="search" title="Search workspace" close={() => setDialog("")}>
      <label className="gw-search-input"><Search size={18}/><input autoFocus aria-label="Search pages and services" placeholder="Search pages and services" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="gw-results">{results.map(({ label, to, icon: Icon, locked }) => <Link to={to} key={label} onClick={() => setDialog("")}><Icon size={17}/>{label}<small>{locked ? "Unavailable" : <ArrowUpRight size={14}/>}</small></Link>)}
      {!results.length && <p>No matching pages or services.</p>}</div>
    </WorkspaceDialog>}
    {dialog === "account" && <WorkspaceDialog key="account" title={user?.name || "Account"} close={() => setDialog("")}>
      <div className="gw-results"><Link to={base + "/profile"} onClick={() => setDialog("")}><UserRound size={18}/>My profile</Link>
      <button onClick={admin ? adminLogout : logout}><LogOut size={18}/>Sign out</button></div>
    </WorkspaceDialog>}</AnimatePresence>
  </div></MotionConfig>;
}
