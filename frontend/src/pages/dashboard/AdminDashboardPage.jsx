import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { useAdminDashboard } from '../../features/admin/hooks/useAdminDashboard';
import GlassWorkspace from '../../components/workspace/GlassWorkspace';
import { TransactionPanel } from '../../components/workspace/DashboardPanels';
import { AccountSummary } from '../../features/admin/components/DashboardOverview';
import UserSettings from '../user/UserSettings';
import { PlatformHealth } from '../../features/admin/components/PlatformHealth';
import { OperationalQueues } from '../../features/admin/components/OperationalQueues';
import { BusinessPerformance } from '../../features/admin/components/BusinessPerformance';
import { DashboardOverview } from '../../features/admin/components/DashboardOverview';
import { AdminUserTable } from '../../features/admin/components/AdminUserTable';

import { ActionModal } from '../../features/admin/modals/ActionModal';
import { AddAgentModal } from '../../features/admin/modals/AddAgentModal';
import UserProfile from '../user/UserProfile';
import AdminKycReview from '../../features/admin/components/AdminKycReview';

export default function AdminDashboardPage() {
  const location = useLocation();
  const isDirectoryRoute = Boolean(matchPath('/admin/users', location.pathname));
  const [searchParams] = useSearchParams();
  const requestedRoleId = searchParams.get('roleId') || '';
  const [showRoles, setShowRoles] = useState(false);
  const [businessRefreshVersion, setBusinessRefreshVersion] = useState(0);
  const [businessRefreshResult, setBusinessRefreshResult] = useState(null);
  const recordBusinessRefresh = useCallback(({ version, at }) => {
    setBusinessRefreshResult((previous) => ({ version, at: at ?? previous?.at }));
  }, []);
  const {
    // Navigation
    getCurrentRoleTitle,
    permittedRoles,
    rolesUnavailable,
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
  } = useAdminDashboard(isDirectoryRoute && (showRoles || Boolean(requestedRoleId)));

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
  const isDashboard = Boolean(matchPath('/admin/dashboard', location.pathname));
  const isKycRoute = Boolean(matchPath('/admin/kyc', location.pathname));
  const unavailableTitle = matchPath('/admin/reports', location.pathname) ? 'Reports'
    : matchPath('/admin/settings', location.pathname) ? 'Settings' : null;
  const selectedRole = permittedRoles.find((role) => String(role.id) === requestedRoleId);
  const directoryRoleId = selectedRole ? String(selectedRole.id) : '';
  const directoryKey = metricParams ? new URLSearchParams(metricParams).toString() : directoryRoleId;
  const defaultDirectory = !requestedRoleId && !metricParams;
  const metricTitle = customerMetric === 'active' ? 'Active Customers' : 'New Customer Signups';
  const previousDirectoryRef = useRef({ pathname: location.pathname, roleId: directoryRoleId });

  // Keep the selected role in the URL so direct links and refreshes retain the directory.
  useEffect(() => {
    setSelectedRoleId(isDirectoryRoute ? directoryRoleId : '');
    if (isDirectoryRoute && (!requestedRoleId || directoryRoleId || metricParams)) loadUsers(directoryRoleId, metricParams);
  }, [isDirectoryRoute, directoryKey, directoryRoleId, metricParams, requestedRoleId, setSelectedRoleId, loadUsers]);

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

  const customer = permittedRoles.find(role => role.slug === 'US');
  const customerDirectory = customer ? '/admin/users?roleId=' + customer.id : '/admin/users';
  return (
    <GlassWorkspace admin permittedRoles={permittedRoles}>
          {isProfileRoute ? (
            <UserProfile key={location.pathname} targetUserId={targetUserMatch?.params.id} />
          ) : isKycRoute ? (
            <AdminKycReview key={`${from ?? ""}:${to ?? ""}:${searchParams.get('step') ?? ""}`} />
          ) : isDashboard ? (
            <DashboardOverview customerDirectory={customerDirectory} />
          ) : unavailableTitle === 'Reports' ? (
            <div className="gw-reports space-y-4">
              <div className="gw-panel-heading"><h1>Business reports</h1><button className="gw-chip" disabled={businessRefreshResult?.version !== businessRefreshVersion}
                onClick={() => setBusinessRefreshVersion(value => value + 1)}>Refresh business metrics</button></div>
              <BusinessPerformance refreshVersion={businessRefreshVersion} onRefreshComplete={recordBusinessRefresh} />
              <PlatformHealth /><OperationalQueues /><AccountSummary /><TransactionPanel admin />
            </div>
          ) : unavailableTitle === 'Settings' ? (
            <UserSettings />
          ) : (
            <><div className="gw-directory-tools">
              {!showRoles && !requestedRoleId && <button className="gw-chip" onClick={() => setShowRoles(true)}>Role directories</button>}
              {permittedRoles.map(role => <Link className="gw-chip" key={role.id} to={'/admin/users?roleId=' + role.id}>{role.name} directory</Link>)}
              {rolesUnavailable && <span role="status">Role-specific account management is unavailable.</span>}
              {(defaultDirectory || directoryKey) && <button className="gw-chip" disabled={isLoadingUsers} onClick={() => loadUsers(directoryRoleId, metricParams)}>Refresh directory</button>}
            </div><AdminUserTable
              getCurrentRoleTitle={metricParams ? () => metricTitle : defaultDirectory ? () => "Customers" : getCurrentRoleTitle}
              memberSearch={memberSearch}
              setMemberSearch={setMemberSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              filteredMembers={lastUserLoad?.roleId !== directoryKey ? [] : defaultDirectory ? filteredMembers.filter(member => Number(member.role_id) === 2) : directoryKey ? filteredMembers : []}
              handleExportCSV={handleExportCSV}
              setAddAgentModalOpen={setAddAgentModalOpen}
              setActionModalUser={setActionModalUser}
              isLoadingUsers={(defaultDirectory || Boolean(directoryKey)) && isLoadingUsers}
              loadError={userLoadError?.roleId === directoryKey ? userLoadError.message : undefined}
              selectedRoleId={metricParams ? '' : directoryRoleId}
              metricView={Boolean(metricParams) || defaultDirectory}
            /></>
          )}

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
    </GlassWorkspace>
  );
}
