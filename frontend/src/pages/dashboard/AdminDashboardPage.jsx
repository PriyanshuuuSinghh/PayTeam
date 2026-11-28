import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { useAdminDashboard } from '../../features/admin/hooks/useAdminDashboard';
import { TransactionPanel } from '../../components/workspace/DashboardPanels';
import { AccountSummary, DashboardOverview } from '../../features/admin/components/DashboardOverview';
import UserSettings from '../user/UserSettings';
import { getUnavailableAdminModule } from '../../features/admin/adminNavigation';
import { Card, CardContent } from '../../components/ui/card';
import { Construction } from 'lucide-react';
import { loadAdminKycReview, loadAdminUserTable } from '../../features/admin/adminPageLoaders';
import UserProfile from '../user/UserProfile';

const AdminKycReview = lazy(loadAdminKycReview);
const AdminUserTable = lazy(loadAdminUserTable);
const ActionModal = lazy(() => import('../../features/admin/modals/ActionModal').then(module => ({ default: module.ActionModal })));
const AddAgentModal = lazy(() => import('../../features/admin/modals/AddAgentModal').then(module => ({ default: module.AddAgentModal })));

export default function AdminDashboardPage({ onPermittedRolesChange }) {
  const location = useLocation();
  const isDirectoryRoute = Boolean(matchPath('/admin/users', location.pathname));
  const [searchParams] = useSearchParams();
  const requestedRoleId = searchParams.get('roleId') || '';
  const [showRoles, setShowRoles] = useState(false);
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
  const isSettingsRoute = Boolean(matchPath('/admin/settings', location.pathname));
  const unavailableModule = getUnavailableAdminModule(location.pathname);
  const selectedRole = permittedRoles.find((role) => String(role.id) === requestedRoleId);
  const directoryRoleId = selectedRole ? String(selectedRole.id) : '';
  const directoryKey = metricParams ? new URLSearchParams(metricParams).toString() : directoryRoleId;
  const defaultDirectory = !requestedRoleId && !metricParams;
  const metricTitle = customerMetric === 'active' ? 'Active Customers' : 'New Customer Signups';
  const previousDirectoryRef = useRef({ pathname: location.pathname, roleId: directoryRoleId });

  useEffect(() => {
    onPermittedRolesChange?.(permittedRoles);
  }, [onPermittedRolesChange, permittedRoles]);

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
  if (!(isProfileRoute || isDirectoryRoute || isDashboard || isKycRoute || isSettingsRoute || unavailableModule)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <>
      <Suspense fallback={<p role="status" className="gw-panel">Loading admin page…</p>}>
          {isProfileRoute ? (
            <UserProfile key={location.pathname} targetUserId={targetUserMatch?.params.id} />
          ) : isKycRoute ? (
            <AdminKycReview key={`${from ?? ""}:${to ?? ""}:${searchParams.get('step') ?? ""}`} />
          ) : isDashboard ? (
            <>
              <h1 className="sr-only">PayTeam admin dashboard</h1>
              <DashboardOverview />
            </>
          ) : unavailableModule?.path === '/admin/reports' ? (
            <div className="gw-reports space-y-4">
              <h1>Business reports</h1>
              <DashboardOverview />
              <AccountSummary />
              <TransactionPanel admin />
            </div>
          ) : isSettingsRoute ? (
            <UserSettings />
          ) : unavailableModule ? (
            <Card className="admin-glass-menu mx-auto max-w-7xl rounded-2xl border py-0 ring-0">
              <CardContent className="flex items-start gap-3 p-5 sm:p-6">
                <Construction aria-hidden="true" className="size-5 shrink-0 text-blue-800" />
                <div>
                  <h1 className="text-lg font-semibold text-slate-950">{unavailableModule.label}</h1>
                  <p className="mt-1 text-sm text-slate-600">This module is not yet available in PayTeam.</p>
                </div>
              </CardContent>
            </Card>
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

      </Suspense>
      {actionModalUser && <Suspense fallback={null}><ActionModal
        actionModalUser={actionModalUser}
        setActionModalUser={setActionModalUser}
        handleUpdateMemberDetails={handleUpdateMemberDetails}
      /></Suspense>}

      {/* Add New Agent Modal */}
      {addAgentModalOpen && <Suspense fallback={null}><AddAgentModal
        addAgentModalOpen={addAgentModalOpen}
        setAddAgentModalOpen={setAddAgentModalOpen}
        handleOnboardAgent={handleOnboardAgent}
        selectedRole={selectedRole?.slug || ""}
      /></Suspense>}
    </>
  );
}
