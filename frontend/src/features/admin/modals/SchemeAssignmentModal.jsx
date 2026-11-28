import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormDialog from "../../../components/workspace/FormDialog";
import { assignCustomerSchemes, fetchCustomerSchemeResolution, fetchSchemeAssignmentOptions } from "../services/adminApi";

export default function SchemeAssignmentModal({ customers, onClose, onAssigned }) {
  const customerId = customers.length === 1 ? String(customers[0].id) : null;
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(null);
  const [schemeId, setSchemeId] = useState("");
  const [resolution, setResolution] = useState(null);
  const [resolutionUnavailable, setResolutionUnavailable] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [savingError, setSavingError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchSchemeAssignmentOptions(offset, controller.signal).then(setPage).catch((error) => {
      if (controller.signal.aborted) return;
      setLoadingError(error.response?.status === 404 ? "Scheme assignments are unavailable." : "Unable to load active schemes.");
    });
    return () => controller.abort();
  }, [offset]);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    fetchCustomerSchemeResolution(customerId, controller.signal).then(setResolution).catch(() => {
      if (!controller.signal.aborted) setResolutionUnavailable(true);
    });
    return () => controller.abort();
  }, [customerId]);

  function changePage(nextOffset) {
    setSchemeId("");
    setPage(null);
    setOffset(nextOffset);
  }

  async function submit(event) {
    event.preventDefault();
    if (!schemeId || saving) return;
    setSaving(true);
    setSavingError("");
    try {
      const changed = await assignCustomerSchemes(customers.map(({ id }) => String(id)), schemeId);
      toast.success(changed ? `Scheme assigned to ${changed} ${changed === 1 ? "customer" : "customers"}.` : "The selected scheme was already assigned.");
      onAssigned();
    } catch (error) {
      setSavingError(error.response?.data?.message || "Unable to save the assignment. Verify the current assignment before retrying.");
      setSaving(false);
    }
  }

  const pagination = page?.pagination;
  return (
    <FormDialog title="Assign scheme" close={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit} className="admin-glass-menu admin-glass-modal space-y-4 rounded-2xl border border-white p-6 text-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Assign scheme</h2>
          <p className="text-slate-600">{customerId ? customers[0].name : `${customers.length} selected customers`}</p>
        </div>
        {resolution && <div className="space-y-1 text-xs text-slate-600">
          <p>Assigned scheme: {resolution.assignedScheme?.name || "Unassigned"}</p>
          <p>Effective scheme: {resolution.effectiveScheme.name}{resolution.source === "default" ? " (default fallback)" : ""}</p>
        </div>}
        {resolutionUnavailable && !loadingError && <p role="status" className="text-xs text-slate-600">Current assignment could not be loaded.</p>}
        {loadingError ? <p role="alert">{loadingError}</p> : !page ? <p role="status">Loading active schemes…</p> : page.items.length === 0 ? (
          <p role="status">No active schemes on this page.</p>
        ) : (
          <label className="block font-semibold text-slate-700">
            Active scheme
            <select required value={schemeId} onChange={(event) => setSchemeId(event.target.value)} disabled={saving}
              className="admin-glass-control mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Select a scheme</option>
              {page.items.map((scheme) => <option key={scheme.id} value={scheme.id}>
                {scheme.name} ({scheme.code}){scheme.isDefault === 1 ? " · Default" : ""}
              </option>)}
            </select>
          </label>
        )}
        {pagination && (offset > 0 || offset + pagination.limit < pagination.total) && (
          <div className="flex gap-2">
            <button type="button" className="gw-chip" disabled={saving || offset === 0}
              onClick={() => changePage(Math.max(0, offset - pagination.limit))}>Previous schemes</button>
            <button type="button" className="gw-chip" disabled={saving || offset + pagination.limit >= pagination.total}
              onClick={() => changePage(offset + pagination.limit)}>Next schemes</button>
          </div>
        )}
        {savingError && <p role="alert" className="text-rose-700">{savingError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="gw-chip" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-glass-selected rounded-xl px-3 py-2 disabled:opacity-50"
            disabled={!schemeId || saving}>{saving ? "Assigning…" : "Assign scheme"}</button>
        </div>
      </form>
    </FormDialog>
  );
}
