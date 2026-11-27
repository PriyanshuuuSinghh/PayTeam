import api from "../../../api/axios";

const root = "/admin/kyc";

export async function getKycQueueSummary(signal) {
  const { data } = await api.get(`${root}/queue-summary`, { signal });
  const summary = data?.data;
  if (!Number.isInteger(summary?.total) || !summary.distribution) {
    throw new Error("Invalid KYC queue summary");
  }
  return summary;
}

export async function listAdminKycApplications(params = {}, signal) {
  const { data } = await api.get(root, { params, signal });
  return data.data;
}

export async function getAdminKycDetails(caseId) {
  const { data } = await api.get(`${root}/${caseId}`);
  return data.data;
}

export async function getAdminKycDocument(caseId, assetId) {
  const { data } = await api.get(`${root}/${caseId}/documents/${assetId}`);
  return data.data;
}

export async function approveAdminKyc(caseId) {
  const { data } = await api.patch(`${root}/${caseId}/approve`);
  return data.data;
}

export async function rejectAdminKyc(caseId, rejectionReason) {
  const { data } = await api.patch(`${root}/${caseId}/reject`, { rejectionReason });
  return data.data;
}
