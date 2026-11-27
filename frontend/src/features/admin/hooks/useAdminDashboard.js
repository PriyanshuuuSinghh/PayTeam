import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  fetchBackendUsers,
  fetchBackendDescendantRoles,
  createBackendUser,
  updateBackendUser
} from '../services/adminApi';

export function useAdminDashboard() {
  // Navigation State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Real Database Users State
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [lastUserLoad, setLastUserLoad] = useState(null);
  const [userLoadError, setUserLoadError] = useState(null);
  const [permittedRoles, setPermittedRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const userLoadRequestRef = useRef(0);

  // Search & Filter State
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [actionModalUser, setActionModalUser] = useState(null);
  const [addAgentModalOpen, setAddAgentModalOpen] = useState(false);

  // Fetch real users from backend API
  const loadUsers = useCallback(async (roleId, metricParams) => {
    const requestId = ++userLoadRequestRef.current;
    const key = metricParams ? new URLSearchParams(metricParams).toString() : String(roleId ?? "");
    try {
      setIsLoadingUsers(true);
      setUserLoadError(null);
      const res = await fetchBackendUsers(metricParams ?? (roleId ? { roleId } : {}));
      if (requestId !== userLoadRequestRef.current) return;
      if (!Array.isArray(res?.data)) throw new Error("Invalid directory response");
      setUsers(res.data);
      setLastUserLoad({ roleId: key, at: new Date() });
    } catch (err) {
      if (requestId !== userLoadRequestRef.current) return;
      setUsers([]);
      const message = err?.response?.data?.message || "Unable to load users. Please try again.";
      setUserLoadError({ roleId: key, message });
      toast.error(message);
      if (import.meta.env.DEV) {
        console.warn("Admin user directory request failed", {
          method: "GET",
          endpoint: "/api/users",
          status: err?.response?.status,
          code: err?.response?.data?.code,
        });
      }
    } finally {
      if (requestId === userLoadRequestRef.current) setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchBackendDescendantRoles().then((response) => {
      const roles = Array.isArray(response?.data) ? response.data : [];
      if (!mounted) return;
      setPermittedRoles(roles);
    }).catch(() => {
      if (mounted) {
        toast.error("Unable to load permitted role directories");
        if (import.meta.env.DEV) {
          console.warn("Permitted role directory request failed", {
            method: "GET",
            endpoint: "/api/users/roles/descendants",
          });
        }
      }
    });
    return () => { mounted = false; };
  }, []);

  // Current active view heading helper
  const getCurrentRoleTitle = useCallback(() => {
    if (selectedRoleId) {
      return permittedRoles.find((role) => String(role.id) === String(selectedRoleId))?.name || 'User';
    }
    return 'All Users';
  }, [selectedRoleId, permittedRoles]);

  // Filtered members list based on real backend data
  const filteredMembers = useMemo(() => {
    return users.filter((u) => {
      // Search matching: name, mobile, email, shopname, id
      const q = memberSearch.toLowerCase().trim();
      const searchMatch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.mobile && u.mobile.includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.shopname && u.shopname.toLowerCase().includes(q)) ||
        String(u.id).includes(q);

      // Status matching: 'active' / 'inactive'
      const statusMatch =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Active'
          ? u.status === 'active'
          : u.status !== 'active';

      return searchMatch && statusMatch;
    });
  }, [users, memberSearch, statusFilter]);

  // Real backend user creation
  const handleOnboardAgent = useCallback(
    async (agentData) => {
      try {
        const payload = {
          name: agentData.name.trim(),
          email: agentData.email.trim().toLowerCase(),
          mobile: agentData.mobile.trim(),
          role: agentData.role, // role slug (e.g. 'RT', 'DT', 'MD', 'CNF', 'SH', 'NSM', 'SA')
          password: agentData.password,
          shopname: agentData.shopname?.trim() || null,
          city: agentData.city?.trim() || null,
          state: agentData.state?.trim() || null,
          address: agentData.address?.trim() || null,
          pincode: agentData.pincode ? String(agentData.pincode).trim() : null,
        };

        const res = await createBackendUser(payload);
        if (res && res.data) {
          setUsers((prev) => [res.data, ...prev]);
          toast.success("User created successfully.");
          return res.data;
        }
      } catch (err) {
        const errMsg =
          err.response?.data?.message || err.message || 'Failed to onboard agent';
        toast.error(errMsg);
      }
    },
    []
  );

  // Real backend user details update
  const handleUpdateMemberDetails = useCallback(
    async (userId, updatedFields) => {
      try {
        const res = await updateBackendUser(userId, updatedFields);
        if (res && res.data) {
          setUsers((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, ...res.data } : u))
          );
          toast.success("User profile updated successfully.");
          setActionModalUser(null);
        }
      } catch (err) {
        const errMsg =
          err.response?.data?.message || err.message || 'Failed to update agent details';
        toast.error(errMsg);
      }
    },
    []
  );

  // Export Real Users to CSV
  const handleExportCSV = useCallback(
    (filename, dataRows) => {
      if (!dataRows || !dataRows.length) {
        toast.error('No user data available to export');
        return;
      }
      const keys = ['id', 'name', 'email', 'mobile', 'role_name', 'shopname', 'city', 'state', 'status'];
      const headers = ['ID', 'Name', 'Email', 'Mobile', 'Role', 'Shop Name', 'City', 'State', 'Status'];

      const rows = dataRows.map((u) =>
        keys
          .map((k) => `"${String(u[k] || '').replace(/"/g, '""')}"`)
          .join(',')
      );

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported ${filename}.csv with ${dataRows.length} real records`);
    },
    []
  );

  return {
    // Navigation
    permittedRoles,
    selectedRoleId,
    setSelectedRoleId,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    getCurrentRoleTitle,

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

    // Actions backed by real Backend APIs
    handleOnboardAgent,
    handleUpdateMemberDetails,
    handleExportCSV,
  };
}

export default useAdminDashboard;
