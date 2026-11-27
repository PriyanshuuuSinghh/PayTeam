import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { useAdminDashboard } from '../../features/admin/hooks/useAdminDashboard';
import { AdminSidebar } from '../../features/admin/components/AdminSidebar';
import { AdminHeader } from '../../features/admin/components/AdminHeader';
import { DashboardOverview } from '../../features/admin/components/DashboardOverview';
import { AdminUserTable } from '../../features/admin/components/AdminUserTable';

import { ActionModal } from '../../features/admin/modals/ActionModal';
import { AddAgentModal } from '../../features/admin/modals/AddAgentModal';
import UserProfile from '../user/UserProfile';
import AdminKycReview from '../../features/admin/components/AdminKycReview';

export default function AdminDashboardPage() {
  const [businessRefreshVersion, setBusinessRefreshVersion] = useState(0);
  const [businessRefreshResult, setBusinessRefreshResult] = useState(null);
  const {
    // Navigation
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    getCurrentRoleTitle,
    permittedRoles,
    selectedRoleId,
    setSelectedRoleId,

    // Real Data & Stats
    filteredMembers,
    isLoadingUsers,
    lastUserLoad,
    userLoadError,
    loadUsers,

    // Filters
    memberSearch,
    setMemberSearch,
    statusFilter,
    setStatusFilter,

    // Modals
    actionModalUser,
    setActionModalUser,
    addAgentModalOpen,
    setAddAgentModalOpen,

    // Actions
    handleOnboardAgent,
    handleUpdateMemberDetails,
    handleExportCSV,
  } = useAdminDashboard();

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedRoleId = searchParams.get('roleId') || '';
  const customerMetric = searchParams.get('customers');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const metricParams = useMemo(() => {
    if (customerMetric === 'active') return { customers: 'active' };
    if (customerMetric === 'signups' && from && to) return { customers: 'signups', from, to };
    return null;
  }, [customerMetric, from, to]);
  const targetUserMatch = matchPath('/admin/users/:id', location.pathname);
  const isCreateRoute = Boolean(matchPath('/admin/users/create', location.pathname));
  const isProfileRoute = Boolean(matchPath('/admin/profile', location.pathname) || targetUserMatch);
  const isDirectoryRoute = Boolean(matchPath('/admin/users', location.pathname));
  const isDashboard = Boolean(matchPath('/admin/dashboard', location.pathname));
  const isKycRoute = Boolean(matchPath('/admin/kyc', location.pathname));
  const unavailableTitle = matchPath('/admin/reports', location.pathname) ? 'Reports'
    : matchPath('/admin/settings', location.pathname) ? 'Settings' : null;
  const selectedRole = permittedRoles.find((role) => String(role.id) === requestedRoleId);
  const directoryRoleId = selectedRole ? String(selectedRole.id) : '';
  const directoryKey = metricParams ? new URLSearchParams(metricParams).toString() : directoryRoleId;
  const refreshRoleId = isDirectoryRoute && directoryKey ? directoryKey : null;
  const metricTitle = customerMetric === 'active' ? 'Active Customers' : 'New Customer Signups';
  const previousDirectoryRef = useRef({ pathname: location.pathname, roleId: directoryRoleId });

  // Keep the selected role in the URL so direct links and refreshes retain the directory.
  useEffect(() => {
    setSelectedRoleId(isDirectoryRoute ? directoryRoleId : '');
    if (isDirectoryRoute && directoryKey) loadUsers(directoryRoleId, metricParams);
  }, [isDirectoryRoute, directoryKey, directoryRoleId, metricParams, setSelectedRoleId, loadUsers]);

  useEffect(() => {
    const selectionChanged = previousDirectoryRef.current.pathname !== location.pathname ||
      previousDirectoryRef.current.roleId !== directoryRoleId;
    if (!isDirectoryRoute || !directoryRoleId || selectionChanged) setAddAgentModalOpen(false);
    previousDirectoryRef.current = { pathname: location.pathname, roleId: directoryRoleId };
  }, [isDirectoryRoute, location.pathname, directoryRoleId, setAddAgentModalOpen]);

  if (isCreateRoute) return <Navigate to="/admin/users" replace />;
  if (!(isProfileRoute || isDirectoryRoute || isDashboard || isKycRoute || unavailableTitle)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  let pageTitle = 'Dashboard';
  const breadcrumbs = [{ label: 'Admin', to: isDashboard ? undefined : '/admin/dashboard' }];
  if (targetUserMatch) {
    pageTitle = 'User Profile';
    breadcrumbs.push({ label: 'Users', to: directoryRoleId ? `/admin/users?roleId=${encodeURIComponent(directoryRoleId)}` : '/admin/users' });
  } else if (isProfileRoute) {
    pageTitle = 'My Profile';
  } else if (isDirectoryRoute) {
    pageTitle = metricParams ? metricTitle : selectedRole ? `${selectedRole.name} Directory` : 'User Directory';
    if (selectedRole || metricParams) breadcrumbs.push({ label: 'Users', to: '/admin/users' });
  } else if (isKycRoute) {
    pageTitle = 'KYC Management';
  } else if (unavailableTitle) {
    pageTitle = unavailableTitle;
  }
  breadcrumbs.push({ label: pageTitle });

  return (
    <div className={`min-h-screen bg-[#f8fafc] flex font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white ${sidebarCollapsed ? '[--admin-sidebar-width:4.5rem]' : '[--admin-sidebar-width:14rem]'}`}>
      {/* Admin Sidebar Navigation */}
      <AdminSidebar
        sidebarCollapsed={sidebarCollapsed}
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
        permittedRoles={permittedRoles}
      />

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-[margin] duration-200 motion-reduce:transition-none md:ml-(--admin-sidebar-width)"
      >
        {/* Top Header */}
        <AdminHeader
          pageTitle={pageTitle}
          breadcrumbs={breadcrumbs}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          mobileSidebarOpen={mobileSidebarOpen}
          setMobileSidebarOpen={setMobileSidebarOpen}
          onRefresh={isDashboard ? () => setBusinessRefreshVersion((current) => current + 1)
            : refreshRoleId === null ? undefined : () => loadUsers(directoryRoleId, metricParams)}
          refreshLabel={isDashboard ? "Refresh business metrics" : "Refresh account data"}
          isRefreshing={isDashboard ? businessRefreshResult?.version !== businessRefreshVersion : isLoadingUsers}
          lastUpdated={isDashboard ? businessRefreshResult?.at : lastUserLoad?.roleId === refreshRoleId ? lastUserLoad.at : undefined}
        />

        {/* Dynamic Main Workspace Views - Backend-Backed Only */}
        <main className="min-w-0 flex-1 p-3 sm:p-5 xl:px-6">
          {isProfileRoute ? (
            <UserProfile key={location.pathname} targetUserId={targetUserMatch?.params.id} />
          ) : isKycRoute ? (
            <AdminKycReview key={`${from ?? ""}:${to ?? ""}:${searchParams.get('step') ?? ""}`} />
          ) : isDashboard ? (
            <DashboardOverview
              refreshVersion={businessRefreshVersion}
              onBusinessRefreshComplete={setBusinessRefreshResult}
            />
          ) : unavailableTitle ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm">This admin workspace is unavailable.</p>
          ) : (
            <AdminUserTable
              getCurrentRoleTitle={metricParams ? () => metricTitle : getCurrentRoleTitle}
              memberSearch={memberSearch}
              setMemberSearch={setMemberSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              filteredMembers={directoryKey && (metricParams || selectedRoleId === directoryRoleId) && lastUserLoad?.roleId === directoryKey ? filteredMembers : []}
              handleExportCSV={handleExportCSV}
              setAddAgentModalOpen={setAddAgentModalOpen}
              setActionModalUser={setActionModalUser}
              isLoadingUsers={Boolean(directoryKey) && isLoadingUsers}
              loadError={directoryKey && userLoadError?.roleId === directoryKey ? userLoadError.message : undefined}
              selectedRoleId={metricParams ? '' : directoryRoleId}
              metricView={Boolean(metricParams)}
            />
          )}
        </main>
      </div>

      {/* Edit Agent Configuration Modal */}
      <ActionModal
        actionModalUser={actionModalUser}
        setActionModalUser={setActionModalUser}
        handleUpdateMemberDetails={handleUpdateMemberDetails}
      />

      {/* Add New Agent Modal */}
      <AddAgentModal
        addAgentModalOpen={addAgentModalOpen}
        setAddAgentModalOpen={setAddAgentModalOpen}
        handleOnboardAgent={handleOnboardAgent}
        selectedRole={selectedRole?.slug || ""}
      />
    </div>
  );
}
