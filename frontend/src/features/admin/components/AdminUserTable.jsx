import { useState } from "react";
import {
  Search,
  Download,
  Plus,
  Settings,
  Filter,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import SchemeAssignmentModal from "../modals/SchemeAssignmentModal";

function canAssignScheme(member) {
  return Number(member.role_id) === 2 && member.status === "active" &&
    (typeof member.id === "string" ? /^[1-9]\d*$/.test(member.id) : Number.isSafeInteger(member.id) && member.id > 0);
}

export function AdminUserTable({
  getCurrentRoleTitle = () => "All Users",
  memberSearch = "",
  setMemberSearch = () => {},
  statusFilter = "All",
  setStatusFilter = () => {},
  filteredMembers = [],
  handleExportCSV = () => {},
  setAddAgentModalOpen = () => {},
  setActionModalUser = () => {},
  isLoadingUsers = false,
  loadError,
  selectedRoleId = "",
  metricView = false,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [assignmentCustomers, setAssignmentCustomers] = useState(null);
  const selectedCustomers = filteredMembers.filter((member) => selected.has(String(member.id)) && canAssignScheme(member));

  function toggleCustomer(id, checked) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }

  return (
    <div className="admin-glass-workview mx-auto max-w-7xl space-y-4 pb-8">
      {/* ── Breadcrumb & Page Title ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400 flex items-center gap-2 mb-1">
            <span>Admin</span>
            <span>/</span>
            <span>Directory</span>
            <span>/</span>
            <span className="font-semibold text-slate-700 capitalize">
              {getCurrentRoleTitle()}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {getCurrentRoleTitle()}{metricView ? "" : " Directory"}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage customer profiles and check verification status.
          </p>
        </div>

        <button
          onClick={() => setAddAgentModalOpen(true)}
          disabled={!selectedRoleId}
          className="admin-glass-selected bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={2.25} />
          <span>Create User</span>
        </button>
      </div>

      {/* ── All Users Table Panel Container (User Dashboard Style) ── */}
      <div className="admin-glass-card overflow-hidden rounded-2xl border">
        {/* Header Summary */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {getCurrentRoleTitle()} Records
            </h3>
            <p className="text-xs text-slate-400 mt-1">{isLoadingUsers ? "Loading directory…" : loadError ? "Directory unavailable" : filteredMembers.length + " matching accounts"}</p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {!isLoadingUsers && !loadError && selectedCustomers.length > 0 && (
              <button type="button" className="gw-chip" onClick={() => setAssignmentCustomers(selectedCustomers)}>
                Assign scheme to {selectedCustomers.length} selected
              </button>
            )}
            {selected.size > 0 && <button type="button" className="gw-chip" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>}
            <span className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200/80 font-bold rounded-xl text-xs">
              {isLoadingUsers || loadError ? "—" : filteredMembers.length + " found"}
            </span>

            <button
              onClick={() =>
                handleExportCSV(
                  `${getCurrentRoleTitle()}_Directory`,
                  filteredMembers
                )
              }
              className="admin-glass-control flex items-center gap-1.5 px-3.5 py-2 border border-white text-slate-700 rounded-xl font-semibold cursor-pointer text-sm"
            >
              <Download className="w-4 h-4 text-black" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="admin-glass-workview-toolbar p-3 sm:px-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, mobile, email, shop, or ID..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Accounts</option>
                <option value="Inactive">Inactive Accounts</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Table Layout ────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-5 w-24 text-center">Status</th>
                <th className="py-3 px-5 min-w-[220px]">Customer & contact</th>
                <th className="py-3 px-5 min-w-[200px]">Shop & Location</th>
                <th className="py-3 px-5 min-w-[170px]">Parent Hierarchy</th>
                <th className="py-3 px-5 w-32 text-center">KYC Compliance</th>
                <th className="py-3 px-5 w-24 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoadingUsers ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading customer records…</span>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr><td colSpan="6" className="py-8 text-center text-sm text-rose-700"><p role="alert">{loadError}</p></td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    <div className="max-w-sm mx-auto space-y-1.5">
                      <p className="font-semibold text-slate-700 text-sm">
                        {metricView ? "No matching customers" : selectedRoleId ? `No ${getCurrentRoleTitle()} users found` : "Choose a role directory"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {metricView || selectedRoleId ? "Try adjusting your search criteria." : "Select an available role directory above."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const isActive = (m.status || "active").toLowerCase() === "active";
                  const kycStatus = String(m.kyc?.status || "not started").toLowerCase();
                  const isKycVerified =
                    kycStatus === "verified" || kycStatus === "completed" || kycStatus === "approved";
                  const isKycSubmitted =
                    kycStatus === "submitted" || kycStatus === "under_review";

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Status */}
                      <td className="py-4 px-5 text-center align-middle">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Customer & contact */}
                      <td className="py-4 px-5 align-middle">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          {m.name}
                          <span className="font-mono text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{m.id}
                          </span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1 flex items-center gap-2">
                          <span className="font-mono">{m.mobile}</span>
                          {m.email && (
                            <span className="text-slate-400 truncate max-w-[150px]">
                              • {m.email}
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className="inline-block bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                            {m.role_name || m.role_slug || "Unavailable"}
                          </span>
                        </div>
                      </td>

                      {/* Shop & Location */}
                      <td className="py-4 px-5 align-middle">
                        <div className="font-semibold text-slate-800">
                          {m.shopname || "—"}
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          {[m.city, m.state, m.pincode].filter(Boolean).join(", ") ||
                            "Address not registered"}
                        </div>
                      </td>

                      {/* Parent Hierarchy */}
                      <td className="py-4 px-5 align-middle">
                        <div className="font-medium text-slate-800">
                          {m.parent_name || "Unassigned"}
                        </div>
                        {m.company_name && (
                          <div className="text-slate-400 text-[11px] mt-0.5 truncate max-w-[170px]">
                            {m.company_name}
                          </div>
                        )}
                      </td>

                      {/* KYC Compliance Status */}
                      <td className="py-4 px-5 text-center align-middle">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-[11px] font-semibold capitalize ${
                            isKycVerified
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                              : isKycSubmitted
                              ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                              : "bg-amber-50 text-amber-700 border border-amber-200/80"
                          }`}
                        >
                          {isKycVerified
                            ? "Verified"
                            : isKycSubmitted
                            ? "Under Review"
                            : kycStatus.replaceAll("_", " ")}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-4 px-5 text-center align-middle">
                        <div className="inline-flex items-center gap-1">
                          {canAssignScheme(m) && <>
                            <input type="checkbox" checked={selected.has(String(m.id))}
                              disabled={!selected.has(String(m.id)) && selected.size >= 100}
                              aria-label={`Select ${m.name} (#${m.id}) for scheme assignment`}
                              onChange={(event) => toggleCustomer(m.id, event.target.checked)} />
                            <button type="button" className="gw-chip" onClick={() => setAssignmentCustomers([m])}
                              aria-label={`Assign scheme to ${m.name} (#${m.id})`}>Scheme</button>
                          </>}
                          <Link to={`/admin/users/${m.id}?roleId=${encodeURIComponent(selectedRoleId)}`} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition border border-slate-200 inline-flex items-center justify-center" title="View user profile">
                            <Eye className="w-4 h-4 text-black" />
                          </Link>
                          <button
                            onClick={() => setActionModalUser(m)}
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition border border-slate-200 inline-flex items-center justify-center cursor-pointer shadow-2xs hover:shadow-xs"
                            title="Edit customer details"
                          >
                            <Settings className="w-4 h-4 text-black" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {assignmentCustomers && (
        <SchemeAssignmentModal customers={assignmentCustomers} onClose={() => setAssignmentCustomers(null)}
          onAssigned={() => {
            setSelected(new Set());
            setAssignmentCustomers(null);
          }} />
      )}
    </div>
  );
}

export default AdminUserTable;
