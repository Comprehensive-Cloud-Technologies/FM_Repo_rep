import { buildApiUrl, getApiBaseUrl } from "./utils/runtimeConfig";

const BASE = getApiBaseUrl();

async function request(method, path, body, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
    const opts = { method, headers };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (res.status === 204) return null;

    let data = null;
    try {
        data = await res.json();
    } catch (_) {
        // ignore body parse errors for non-JSON responses
    }

    if (!res.ok) {
      const validationMessage = Array.isArray(data?.errors)
        ? data.errors.map((error) => error?.msg).filter(Boolean).join(", ")
        : "";
      const err = new Error(validationMessage || (data && data.message) || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }

    return data;
}

// â”€â”€ Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getClients = () => request("GET", "/api/clients");
export const createClient = (data) => request("POST", "/api/clients", data);
export const updateClient = (id, data) => request("PUT", `/api/clients/${id}`, data);
export const deleteClient = (id) => request("DELETE", `/api/clients/${id}`);

// â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getUsers = () => request("GET", "/api/users");
export const createUser = (data) => request("POST", "/api/users", data);
export const updateUser = (id, data) => request("PUT", `/api/users/${id}`, data);
export const deleteUser = (id) => request("DELETE", `/api/users/${id}`);

// â”€â”€ Auth / Company Portal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const login = (data) => request("POST", "/api/auth/login", data);

export const getCompanies = (token) => request("GET", "/api/companies", undefined, { authToken: token });
export const createCompany = (token, data) => request("POST", "/api/companies", data, { authToken: token });
export const updateCompany = (token, id, data) => request("PUT", `/api/companies/${id}`, data, { authToken: token });
export const deleteCompany = (token, id) => request("DELETE", `/api/companies/${id}`, undefined, { authToken: token });
export const getCompanyOverview = (token, id) => request("GET", `/api/companies/${id}/overview`, undefined, { authToken: token });
export const getRolePermissions = (token, companyId) => request("GET", `/api/companies/${companyId}/role-permissions`, undefined, { authToken: token });
export const saveRolePermissions = (token, companyId, data) => request("PUT", `/api/companies/${companyId}/role-permissions`, data, { authToken: token });

// Assets (placeholder endpoints to be implemented server-side)
export const getAssets = (token, params = "") => request("GET", `/api/assets${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createAsset = (token, data) => request("POST", "/api/assets", data, { authToken: token });
export const updateAsset = (token, id, data) => request("PUT", `/api/assets/${id}`, data, { authToken: token });
export const deleteAsset = (token, id) => request("DELETE", `/api/assets/${id}`, undefined, { authToken: token });
export const deleteAllAssets = (token, companyId) => request("DELETE", `/api/assets/delete-all?companyId=${companyId}`, undefined, { authToken: token });
export const bulkDeleteAssets = (token, companyId, ids) => request("DELETE", `/api/assets/bulk?companyId=${companyId}`, { ids }, { authToken: token });
export const bulkVerifyAssets = (token, ids, verified = 1) => request("PUT", "/api/assets/bulk-verify", { ids, verified }, { authToken: token });
export const verifyAsset = (token, id, verified = 1) => request("PUT", `/api/assets/${id}/verify`, { verified }, { authToken: token });

/** Bulk-import assets from an Excel/CSV file (multipart upload). */
export const bulkImportAssets = async (token, file, companyId, mode = "add") => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${BASE}/api/assets/bulk-import?companyId=${companyId}&mode=${mode}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
};

/** Download the Excel template for bulk asset import. */
export const getAssetImportTemplateUrl = (mode = "add") => `${BASE}/api/assets/bulk-import/template?mode=${mode}`;

// Asset Queries (public scan-page submissions)
export const updateAssetQuery = (token, id, data) => request("PATCH", `/api/asset-queries/${id}`, data, { authToken: token });

// Departments
export const getDepartments = (token, params = "") => request("GET", `/api/departments${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createDepartment = (token, data) => request("POST", "/api/departments", data, { authToken: token });
export const deleteDepartment = (token, id) => request("DELETE", `/api/departments/${id}`, undefined, { authToken: token });

// Checklists (asset-wise)
export const getChecklists = (token, params = "") => request("GET", `/api/checklists${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createChecklist = (token, data) => request("POST", "/api/checklists", data, { authToken: token });
export const deleteChecklist = (token, id) => request("DELETE", `/api/checklists/${id}`, undefined, { authToken: token });

// Checklist Templates (company-level, created by company portal admins)
export const getChecklistTemplates = (token, params = "") => request("GET", `/api/checklist-templates${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createChecklistTemplate = (token, data) => request("POST", "/api/checklist-templates", data, { authToken: token });
export const getChecklistTemplate = (token, id) => request("GET", `/api/checklist-templates/${id}`, undefined, { authToken: token });
export const updateChecklistTemplate = (token, id, data) => request("PUT", `/api/checklist-templates/${id}`, data, { authToken: token });
export const deleteChecklistTemplate = (token, id) => request("DELETE", `/api/checklist-templates/${id}`, undefined, { authToken: token });

// Logsheets (asset-wise)
export const getLogs = (token, params = "") => request("GET", `/api/logs${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createLog = (token, data) => request("POST", "/api/logs", data, { authToken: token });
export const deleteLog = (token, id) => request("DELETE", `/api/logs/${id}`, undefined, { authToken: token });

// Checklist assignments
export const getChecklistAssignees = (token, id) => request("GET", `/api/checklists/${id}/assignees`, undefined, { authToken: token });
export const assignChecklistToUsers = (token, id, userIds) => request("POST", `/api/checklists/${id}/assignees`, { userIds }, { authToken: token });

// Asset types master
export const getAssetTypes = (token) => request("GET", "/api/asset-types", undefined, { authToken: token });
export const createAssetType = (token, data) => request("POST", "/api/asset-types", data, { authToken: token });
export const updateAssetType = (token, id, data) => request("PUT", `/api/asset-types/${id}`, data, { authToken: token });
export const deleteAssetType = (token, id) => request("DELETE", `/api/asset-types/${id}`, undefined, { authToken: token });

// Company Users (admins / staff per company)
export const getCompanyUsers = (token, companyId) => request("GET", `/api/company-users?companyId=${companyId}`, undefined, { authToken: token });
export const createCompanyUser = (token, data) => request("POST", "/api/company-users", data, { authToken: token });
export const updateCompanyUser = (token, id, data) => request("PUT", `/api/company-users/${id}`, data, { authToken: token });
export const deleteCompanyUser = (token, id) => request("DELETE", `/api/company-users/${id}`, undefined, { authToken: token });

// Logsheet Templates
export const getLogsheetTemplates = (token, params = "") => request("GET", `/api/logsheet-templates${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createLogsheetTemplate = (token, data) => request("POST", "/api/logsheet-templates", data, { authToken: token });
export const getLogsheetTemplate = (token, id) => request("GET", `/api/logsheet-templates/${id}`, undefined, { authToken: token });
export const updateLogsheetTemplate = (token, id, data) => request("PUT", `/api/logsheet-templates/${id}`, data, { authToken: token });
export const deleteLogsheetTemplate = (token, id) => request("DELETE", `/api/logsheet-templates/${id}`, undefined, { authToken: token });
export const assignLogsheetTemplate = (token, templateId, assetId) => request("POST", `/api/logsheet-templates/${templateId}/assign`, { assetId }, { authToken: token });
export const getLogsheetEntriesByTemplate = (token, templateId, params = "") => request("GET", `/api/logsheet-templates/${templateId}/entries${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const submitLogsheetEntry = (token, templateId, data) => request("POST", `/api/logsheet-templates/${templateId}/entries`, data, { authToken: token });
export const getRecentLogsheetEntries = (token) => request("GET", "/api/logsheet-templates/entries/recent", undefined, { authToken: token });
export const getLogsheetEntryDetail = (token, entryId) => request("GET", `/api/logsheet-templates/entries/${entryId}`, undefined, { authToken: token });
export const getRecentChecklistSubmissions = (token) => request("GET", "/api/checklist-templates/submissions/recent", undefined, { authToken: token });
export const getChecklistSubmissionDetail = (token, submissionId) => request("GET", `/api/checklist-templates/submissions/${submissionId}`, undefined, { authToken: token });
export const getTemplatesForAsset = (token, assetId) => request("GET", `/api/logsheet-templates/asset/${assetId}`, undefined, { authToken: token });

// â”€â”€ Company Employee Portal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const companyLogin = (data) => request("POST", "/api/company-auth/login", data);
export const getCompanyPortalMe = (token) => request("GET", "/api/company-portal/me", undefined, { authToken: token });
export const getCompanyPortalChartStats = (token, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return request("GET", `/api/company-portal/dashboard/chart-stats${q ? "?" + q : ""}`, null, { authToken: token });
};
export const getCompanyPortalDashboard = (token) => request("GET", "/api/company-portal/dashboard", undefined, { authToken: token });
export const getCompanyPortalDepartments = (token) => request("GET", "/api/company-portal/departments", undefined, { authToken: token });
export const createCompanyPortalDepartment = (token, data) => request("POST", "/api/company-portal/departments", data, { authToken: token });
export const updateCompanyPortalDepartment = (token, id, data) => request("PUT", `/api/company-portal/departments/${id}`, data, { authToken: token });
export const deleteCompanyPortalDepartment = (token, id) => request("DELETE", `/api/company-portal/departments/${id}`, undefined, { authToken: token });
export const getCompanyPortalAssetTypes = (token) => request("GET", "/api/company-portal/asset-types", undefined, { authToken: token });
export const getCompanyPortalAssets = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request("GET", `/api/company-portal/assets${qs ? "?" + qs : ""}`, undefined, { authToken: token });
};
export const createCompanyPortalAsset = (token, data) => request("POST", "/api/company-portal/assets", data, { authToken: token });
export const updateCompanyPortalAsset = (token, id, data) => request("PATCH", `/api/company-portal/assets/${id}`, data, { authToken: token });
export const deleteCompanyPortalAsset = (token, id) => request("DELETE", `/api/company-portal/assets/${id}`, undefined, { authToken: token });
export const bulkDeleteCompanyPortalAssets = (token, ids) => request("DELETE", "/api/company-portal/assets/bulk", { ids }, { authToken: token });
export const deleteAllCompanyPortalAssets = (token) => request("DELETE", "/api/company-portal/assets/delete-all", undefined, { authToken: token });
export const bulkDeleteCompanyPortalPreQr = (token, ids) => request("DELETE", "/api/company-portal/pre-qr/bulk", { ids }, { authToken: token });
export const assignCompanyPortalAsset = (token, assetId, userId) => request("PATCH", `/api/company-portal/assets/${assetId}/assign`, { userId }, { authToken: token });
export const getAssetByBarcode = (token, barcode) => request("GET", `/api/company-portal/assets/by-barcode/${encodeURIComponent(barcode)}`, undefined, { authToken: token });

/** Bulk-import assets from Excel/CSV via the company portal endpoint. */
export const bulkImportCompanyPortalAssets = async (token, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${BASE}/api/company-portal/assets/bulk-import`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
};

/** Template download URL for company portal bulk import. */
export const getCompanyPortalImportTemplateUrl = () => `${BASE}/api/company-portal/assets/bulk-import/template`;
export const getAssetQueries = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request("GET", `/api/company-portal/asset-queries${qs ? "?" + qs : ""}`, undefined, { authToken: token });
};
export const createAssetQuery = (token, data) => request("POST", "/api/company-portal/asset-queries", data, { authToken: token });
export const resolveAssetQuery = (token, id, resolutionNote) => request("PATCH", `/api/company-portal/asset-queries/${id}/resolve`, { resolutionNote }, { authToken: token });
export const escalateAssetQuery = (token, id) => request("PATCH", `/api/company-portal/asset-queries/${id}/escalate`, {}, { authToken: token });
export const deleteAssetQuery = (token, id) => request("DELETE", `/api/company-portal/asset-queries/${id}`, undefined, { authToken: token });
export const getCompanyPortalChecklists = (token) => request("GET", "/api/company-portal/checklists", undefined, { authToken: token });
export const createCompanyPortalChecklist = (token, data) => request("POST", "/api/company-portal/checklists", data, { authToken: token });
export const updateCompanyPortalChecklist = (token, id, data) => request("PUT", `/api/company-portal/checklists/${id}`, data, { authToken: token });
export const deleteCompanyPortalChecklist = (token, id) => request("DELETE", `/api/company-portal/checklists/${id}`, undefined, { authToken: token });
export const getCompanyPortalLogsheetTemplates = (token) => request("GET", "/api/company-portal/logsheet-templates", undefined, { authToken: token });
export const getCompanyPortalLogsheetTemplate = (token, id) => request("GET", `/api/company-portal/logsheet-templates/${id}`, undefined, { authToken: token });
export const updateCompanyPortalLogsheetTemplate = (token, id, data) => request("PUT", `/api/company-portal/logsheet-templates/${id}`, data, { authToken: token });
export const deleteCompanyPortalLogsheetTemplate = (token, id) => request("DELETE", `/api/company-portal/logsheet-templates/${id}`, undefined, { authToken: token });
export const submitCompanyPortalLogsheetEntry = (token, templateId, data) => request("POST", `/api/company-portal/logsheet-templates/${templateId}/entries`, data, { authToken: token });
export const getCompanyPortalLogsheetEntries = (token, templateId, params = "") => request("GET", `/api/company-portal/logsheet-templates/${templateId}/entries${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getCompanyPortalRecentLogsheetEntries = (token) => request("GET", "/api/company-portal/logsheet-templates/entries/recent", undefined, { authToken: token });
export const getCompanyPortalRecentChecklistSubmissions = (token) => request("GET", "/api/company-portal/checklist-submissions/recent", undefined, { authToken: token });
export const createCompanyPortalLogsheetTemplate = (token, data) => request("POST", "/api/company-portal/logsheet-templates", data, { authToken: token });
export const assignCompanyPortalLogsheetTemplate = (token, templateId, assetId) => request("POST", `/api/company-portal/logsheet-templates/${templateId}/assign`, { assetId }, { authToken: token });
// Pre-generated QR codes
export const getPreQrCodes = (token) => request("GET", "/api/company-portal/pre-qr", undefined, { authToken: token });
export const generatePreQrCodes = (token, count) => request("POST", "/api/company-portal/pre-qr/generate", { count }, { authToken: token });
export const linkPreQrCode = (token, id, assetId) => request("PATCH", `/api/company-portal/pre-qr/${id}/link`, { assetId }, { authToken: token });
export const getPreQrByUid = (uid) => request("GET", `/api/company-portal/pre-qr/by-uid/${encodeURIComponent(uid)}`, undefined, {});
export const registerPreQrAsset = (token, qrId, data) => request("POST", `/api/company-portal/pre-qr/${qrId}/register-asset`, data, { authToken: token });
export const deletePreQrCode = (token, id) => request("DELETE", `/api/company-portal/pre-qr/${id}`, undefined, { authToken: token });
export const getCalibrationVendors = (token) => request("GET", "/api/company-portal/calibration/vendors", undefined, { authToken: token });
export const createCalibrationVendor = (token, data) => request("POST", "/api/company-portal/calibration/vendors", data, { authToken: token });
export const getCalibrationDashboard = (token) => request("GET", "/api/company-portal/calibration/dashboard", undefined, { authToken: token });
export const getAssetCalibrationRecords = (token, assetId) => request("GET", `/api/company-portal/assets/${assetId}/calibration-records`, undefined, { authToken: token });
export const createAssetCalibrationRecord = (token, assetId, data) => request("POST", `/api/company-portal/assets/${assetId}/calibration-records`, data, { authToken: token });
export const getCompanyPortalEmployees = (token) => request("GET", "/api/company-portal/employees", undefined, { authToken: token });
export const createCompanyPortalEmployee = (token, data) => request("POST", "/api/company-portal/employees", data, { authToken: token });
export const updateCompanyPortalEmployee = (token, id, data) => request("PUT", `/api/company-portal/employees/${id}`, data, { authToken: token });
export const deleteCompanyPortalEmployee = (token, id) => request("DELETE", `/api/company-portal/employees/${id}`, undefined, { authToken: token });
export const bulkImportCompanyEmployees = (token, employees) => request("POST", "/api/company-portal/employees/bulk", { employees }, { authToken: token });
export const getCompanyPortalSupervisors = (token) => request("GET", "/api/company-portal/employees/supervisors", undefined, { authToken: token });

// â”€â”€ Custom roles / hierarchy (per-company) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getCompanyRoles    = (token) => request("GET",  "/api/company-portal/roles", undefined, { authToken: token });
export const createCompanyRole  = (token, data) => request("POST", "/api/company-portal/roles", data, { authToken: token });
export const updateCompanyRole  = (token, id, data) => request("PUT", `/api/company-portal/roles/${id}`, data, { authToken: token });
export const deleteCompanyRole  = (token, id) => request("DELETE", `/api/company-portal/roles/${id}`, undefined, { authToken: token });
export const reorderCompanyRoles = (token, items) => request("PUT", "/api/company-portal/roles/reorder/bulk", { items }, { authToken: token });
export const createTemplateUserAssignment = (token, data) => request("POST", "/api/company-portal/template-user-assignments", data, { authToken: token });
export const getTemplateUserAssignments = (token) => request("GET", "/api/company-portal/template-user-assignments", undefined, { authToken: token });
export const getMyTemplateAssignments = (token) => request("GET", "/api/company-portal/template-user-assignments/mine", undefined, { authToken: token });
export const deleteTemplateUserAssignment = (token, id) => request("DELETE", `/api/company-portal/template-user-assignments/${id}`, undefined, { authToken: token });
export const createAdminTemplateUserAssignment = (token, data) => request("POST", "/api/company-users/template-assignments", data, { authToken: token });
export const getAdminOjtTrainings = (token, companyId) => request("GET", `/api/company-users/ojt-trainings?companyId=${companyId}`, undefined, { authToken: token });
export const getAdminOjtProgress  = (token, companyId) => request("GET", `/api/company-users/ojt-progress?companyId=${companyId}`,  undefined, { authToken: token });

// â”€â”€ Admin-level CRUD for Work Orders (client portal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getAdminWorkOrders    = (token, companyId, status) => { const p = []; if (companyId) p.push(`companyId=${companyId}`); if (status) p.push(`status=${status}`); const qs = p.length ? `?${p.join("&")}` : ""; return request("GET", `/api/company-users/work-orders${qs}`, undefined, { authToken: token }); };
export const createAdminWorkOrder  = (token, data) => request("POST", "/api/company-users/work-orders", data, { authToken: token });
export const updateAdminWOStatus   = (token, id, status) => request("PUT", `/api/company-users/work-orders/${id}/status`, { status }, { authToken: token });
export const deleteAdminWorkOrder  = (token, id) => request("DELETE", `/api/company-users/work-orders/${id}`, undefined, { authToken: token });
export const assignAdminWO         = (token, id, data) => request("PUT", `/api/company-users/work-orders/${id}/assign`, data, { authToken: token });

// -- Admin-level QR Code management (client portal) --
export const getAdminQrCodes       = (token, companyId) => request("GET", `/api/company-users/qr-codes?companyId=${companyId}`, undefined, { authToken: token });
export const generateAdminQrCodes  = (token, companyId, count) => request("POST", "/api/company-users/qr-codes/generate", { companyId, count }, { authToken: token });
export const deleteAdminQrCode     = (token, id) => request("DELETE", `/api/company-users/qr-codes/${id}`, undefined, { authToken: token });
export const bulkDeleteAdminQrCodes = (token, ids) => request("DELETE", "/api/company-users/qr-codes/bulk", { ids }, { authToken: token });

// â”€â”€ Admin-level CRUD for Shifts (client portal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getAdminShifts    = (token, companyId) => request("GET", `/api/company-users/shifts?companyId=${companyId}`, undefined, { authToken: token });
export const createAdminShift  = (token, data)      => request("POST", "/api/company-users/shifts", data, { authToken: token });
export const updateAdminShift  = (token, id, data)  => request("PUT", `/api/company-users/shifts/${id}`, data, { authToken: token });
export const deleteAdminShift  = (token, id)        => request("DELETE", `/api/company-users/shifts/${id}`, undefined, { authToken: token });

// â”€â”€ Admin-level CRUD for Employees (client portal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getAdminEmployees   = (token, companyId) => request("GET", `/api/company-users/employees?companyId=${companyId}`, undefined, { authToken: token });
export const createAdminEmployee = (token, data)      => request("POST", "/api/company-users/employees", data, { authToken: token });
export const updateAdminEmployee = (token, id, data)  => request("PUT", `/api/company-users/employees/${id}`, data, { authToken: token });
export const deleteAdminEmployee = (token, id)        => request("DELETE", `/api/company-users/employees/${id}`, undefined, { authToken: token });

// â”€â”€ Smart Checklist Submissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const submitChecklistExecution = (token, checklistId, data) =>
  request("POST", `/api/checklists/${checklistId}/submit`, data, { authToken: token });
export const getChecklistSubmissions = (token, checklistId, params = "") =>
  request("GET", `/api/checklists/${checklistId}/submissions${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getChecklistIssuesReport = (token, params = "") =>
  request("GET", `/api/checklists/submissions/issues${params ? `?${params}` : ""}`, undefined, { authToken: token });

// â”€â”€ Logsheet Grid View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getLogsheetGrid = (token, templateId, params = "") =>
  request("GET", `/api/logsheet-templates/${templateId}/grid${params ? `?${params}` : ""}`, undefined, { authToken: token });

export const getCompanyPortalLogsheetGrid = (token, templateId, params = "") =>
  request("GET", `/api/company-portal/logsheet-templates/${templateId}/grid${params ? `?${params}` : ""}`, undefined, { authToken: token });

export const getLogsheetIssuesReport = (token, params = "") =>
  request("GET", `/api/logsheet-templates/entries/issues${params ? `?${params}` : ""}`, undefined, { authToken: token });

// â”€â”€ Flags & Alert Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getCompanyFlags = (token, params = "") =>
  request("GET", `/api/flags${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getFlagDashboard = (token) =>
  request("GET", "/api/flags/dashboard", undefined, { authToken: token });
export const getFlagSummary = (token) =>
  request("GET", "/api/flags/summary", undefined, { authToken: token });
export const updateFlag = (token, id, data) =>
  request("PUT", `/api/flags/${id}`, data, { authToken: token });
export const createManualFlag = (token, data) =>
  request("POST", "/api/flags", data, { authToken: token });

// â”€â”€ In-app Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getNotifications = (token, params = "") =>
  request("GET", `/api/notifications${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getNotificationCount = (token) =>
  request("GET", "/api/notifications/count", undefined, { authToken: token });
export const markNotificationRead = (token, id) =>
  request("PUT", `/api/notifications/${id}/read`, undefined, { authToken: token });
export const markAllNotificationsRead = (token) =>
  request("PUT", "/api/notifications/read-all", undefined, { authToken: token });

// â”€â”€ Company Portal Work Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getCompanyPortalWorkOrders = (token, params = "") =>
  request("GET", `/api/company-portal/work-orders${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getCompanyPortalWOUsers = (token) =>
  request("GET", "/api/company-portal/work-orders/users", undefined, { authToken: token });
export const assignCompanyPortalWorkOrder = (token, id, data) =>
  request("PUT", `/api/company-portal/work-orders/${id}/assign`, data, { authToken: token });
export const updateWorkOrderCutoff = (token, id, expectedCompletionAt) =>
  request("PATCH", `/api/company-portal/work-orders/${id}/cutoff`, { expectedCompletionAt }, { authToken: token });
export const deleteCompanyPortalWorkOrder = (token, id) =>
  request("DELETE", `/api/company-portal/work-orders/${id}`, undefined, { authToken: token });

// â”€â”€ Company Portal Admin Flags (dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getCompanyPortalAdminFlags = (token, params = "") =>
  request("GET", `/api/flags/admin/list${params ? `?${params}` : ""}`, undefined, { authToken: token });

// â”€â”€ Company Portal Asset Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const cpAD = "/api/company-portal/asset-dashboard";
export const getCPAssetDashboardSummary      = (token, params = "") => request("GET", `${cpAD}/summary${params ? `?${params}` : ""}`,          undefined, { authToken: token });
export const getCPAssetDashboardDistribution = (token, params = "") => request("GET", `${cpAD}/distribution${params ? `?${params}` : ""}`,      undefined, { authToken: token });
export const getCPAssetDashboardPerformance  = (token, params = "") => request("GET", `${cpAD}/performance${params ? `?${params}` : ""}`,       undefined, { authToken: token });
export const getCPAssetDashboardWorkOrders   = (token, params = "") => request("GET", `${cpAD}/work-orders${params ? `?${params}` : ""}`,       undefined, { authToken: token });
export const getCPAssetDashboardMaintCost    = (token, params = "") => request("GET", `${cpAD}/maintenance-cost${params ? `?${params}` : ""}`,  undefined, { authToken: token });
export const getCPAssetDashboardDepreciation = (token, params = "") => request("GET", `${cpAD}/depreciation${params ? `?${params}` : ""}`,      undefined, { authToken: token });
export const getCPAssetDashboardAlerts       = (token, params = "") => request("GET", `${cpAD}/alerts${params ? `?${params}` : ""}`,            undefined, { authToken: token });
export const getCPAssetDashboardHistory      = (token, assetId)     => request("GET", `${cpAD}/${assetId}/history`,                             undefined, { authToken: token });
export const getCPAssetDashboardCompare      = (token, params = "") => request("GET", `${cpAD}/compare${params ? `?${params}` : ""}`,           undefined, { authToken: token });
export const getCPAssetDashboardPredictive   = (token, params = "") => request("GET", `${cpAD}/predictive${params ? `?${params}` : ""}`,        undefined, { authToken: token });

// â”€â”€ Healthcare Asset Management Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const hcBase = "/api/company-portal/healthcare";
export const getHCSnapshot        = (token, params = "") => request("GET", `${hcBase}/snapshot${params ? `?${params}` : ""}`,          undefined, { authToken: token });
export const getHCCharts          = (token, params = "") => request("GET", `${hcBase}/charts${params ? `?${params}` : ""}`,            undefined, { authToken: token });
export const getHCAssets          = (token, params = "") => request("GET", `${hcBase}/assets${params ? `?${params}` : ""}`,            undefined, { authToken: token });
export const getHCFilterOptions   = (token)              => request("GET", `${hcBase}/filter-options`,                                 undefined, { authToken: token });
export const getHCRequests        = (token, params = "") => request("GET", `${hcBase}/requests${params ? `?${params}` : ""}`,          undefined, { authToken: token });
export const updateHCAsset        = (token, id, data)    => request("PATCH", `${hcBase}/assets/${id}`,                                data,      { authToken: token });
export const getHCCallLogs        = (token, params = "") => request("GET", `${hcBase}/records/call-logs${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createHCCallLog      = (token, data)        => request("POST",  `${hcBase}/records/call-logs`,                           data,      { authToken: token });
export const getHCPmsRecords      = (token, params = "") => request("GET", `${hcBase}/records/pms${params ? `?${params}` : ""}`,       undefined, { authToken: token });
export const createHCPmsRecord    = (token, data)        => request("POST",  `${hcBase}/records/pms`,                                 data,      { authToken: token });
export const getHCCalibration     = (token, params = "") => request("GET", `${hcBase}/records/calibration${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createHCCalibration  = (token, data)        => request("POST",  `${hcBase}/records/calibration`,                         data,      { authToken: token });
export const getHCTraining        = (token, params = "") => request("GET", `${hcBase}/records/training${params ? `?${params}` : ""}`,  undefined, { authToken: token });
export const createHCTraining     = (token, data)        => request("POST",  `${hcBase}/records/training`,                            data,      { authToken: token });
export const getHCRber            = (token, params = "") => request("GET", `${hcBase}/records/rber${params ? `?${params}` : ""}`,      undefined, { authToken: token });
export const createHCRber         = (token, data)        => request("POST",  `${hcBase}/records/rber`,                                data,      { authToken: token });
export const getHCWORemarks       = (token, woId)        => request("GET", `${hcBase}/work-orders/${woId}/remarks`,                   undefined, { authToken: token });
export const addHCWORemark        = (token, woId, data)  => request("POST",  `${hcBase}/work-orders/${woId}/remarks`,                 data,      { authToken: token });
export const getHCWOActivity      = (token, woId)        => request("GET", `${hcBase}/work-orders/${woId}/activity`,                  undefined, { authToken: token });
export const getHCExportUrl       = (BASE_URL, type, params = "") => `${BASE_URL}${hcBase}/export?type=${type}${params ? `&${params}` : ""}`;

// â”€â”€ Shift Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getShifts             = (token)          => request("GET",    "/api/shifts",                          undefined, { authToken: token });
export const getActiveShifts       = (token)          => request("GET",    "/api/shifts/active",                   undefined, { authToken: token });
export const createShift           = (token, data)    => request("POST",   "/api/shifts",               data,      { authToken: token });
export const updateShift           = (token, id, data)=> request("PUT",    `/api/shifts/${id}`,          data,      { authToken: token });
export const deleteShift           = (token, id)      => request("DELETE", `/api/shifts/${id}`,          undefined, { authToken: token });
export const getShiftEmployees     = (token, id)      => request("GET",    `/api/shifts/${id}/employees`,undefined, { authToken: token });
export const assignShiftEmployees  = (token, id, userIds) => request("POST", `/api/shifts/${id}/employees`, { userIds }, { authToken: token });
export const removeShiftEmployee   = (token, id, userId)  => request("DELETE", `/api/shifts/${id}/employees/${userId}`, undefined, { authToken: token });

// â”€â”€ OJT Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const cp = "/api/company-portal";
export const getOjtTrainings       = (token)           => request("GET",   `${cp}/ojt/trainings`,                             undefined, { authToken: token });
export const getOjtTraining        = (token, id)        => request("GET",   `${cp}/ojt/trainings/${id}`,                       undefined, { authToken: token });
export const createOjtTraining     = (token, data)      => request("POST",  `${cp}/ojt/trainings`,                             data,      { authToken: token });
export const updateOjtTraining     = (token, id, data)  => request("PUT",   `${cp}/ojt/trainings/${id}`,                       data,      { authToken: token });
export const deleteOjtTraining     = (token, id)        => request("DELETE",`${cp}/ojt/trainings/${id}`,                       undefined, { authToken: token });
export const publishOjtTraining    = (token, id)        => request("PATCH", `${cp}/ojt/trainings/${id}/publish`,               undefined, { authToken: token });
export const createOjtModule       = (token, tid, data) => request("POST",  `${cp}/ojt/trainings/${tid}/modules`,              data,      { authToken: token });
export const updateOjtModule       = (token, mid, data) => request("PUT",   `${cp}/ojt/modules/${mid}`,                        data,      { authToken: token });
export const deleteOjtModule       = (token, mid)       => request("DELETE",`${cp}/ojt/modules/${mid}`,                        undefined, { authToken: token });
export const addOjtModuleContent   = (token, mid, data) => request("POST",  `${cp}/ojt/modules/${mid}/content`,                data,      { authToken: token });
export const deleteOjtContent      = (token, cid)       => request("DELETE",`${cp}/ojt/contents/${cid}`,                       undefined, { authToken: token });
export const createOjtTest         = (token, tid, data) => request("POST",  `${cp}/ojt/trainings/${tid}/test`,                 data,      { authToken: token });
export const addOjtQuestion        = (token, testId, d) => request("POST",  `${cp}/ojt/tests/${testId}/questions`,             d,         { authToken: token });
export const updateOjtQuestion     = (token, qid, data) => request("PUT",   `${cp}/ojt/questions/${qid}`,                      data,      { authToken: token });
export const deleteOjtQuestion     = (token, qid)       => request("DELETE",`${cp}/ojt/questions/${qid}`,                      undefined, { authToken: token });
export const getOjtTrainingUsers   = (token, id)        => request("GET",   `${cp}/ojt/trainings/${id}/users`,                 undefined, { authToken: token });
export const grantOjtCertificate   = (token, pid)       => request("POST",  `${cp}/ojt/progress/${pid}/certificate`,           undefined, { authToken: token });
export const assignOjtTraining     = (token, id, data)  => request("POST",  `${cp}/ojt/trainings/${id}/assign`,                data,      { authToken: token });
export const trainerOjtSignOff     = (token, pid, data) => request("POST",  `${cp}/ojt/progress/${pid}/trainer-signoff`,       data,      { authToken: token });
export const uploadOjtFile = async (token, file) => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(buildApiUrl("/api/company-portal/ojt/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
  return res.json();
};

export const uploadQuestionImage = async (token, file) => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(buildApiUrl("/api/company-portal/upload-image"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
  return res.json();
};

// â”€â”€ Fleet Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getFleetAssets                = (token)           => request("GET",   `${cp}/fleet/assets`,                              undefined, { authToken: token });
export const getFleetAssetDetails          = (token, id)        => request("GET",   `${cp}/fleet/assets/${id}`,                        undefined, { authToken: token });
export const getFleetInspections           = (token, assetId)   => request("GET",   `${cp}/fleet/inspections${assetId ? `/${assetId}` : ""}`, undefined, { authToken: token });
export const createFleetInspection         = (token, data)      => request("POST",  `${cp}/fleet/inspections`,                         data,      { authToken: token });
export const updateFleetInspection         = (token, id, data)  => request("PUT",   `${cp}/fleet/inspections/${id}`,                   data,      { authToken: token });
export const deleteFleetInspection         = (token, id)        => request("DELETE",`${cp}/fleet/inspections/${id}`,                   undefined, { authToken: token });
export const getFleetFuelLogs              = (token, assetId)   => request("GET",   `${cp}/fleet/fuel${assetId ? `?assetId=${assetId}` : ""}`, undefined, { authToken: token });
export const createFleetFuelLog            = (token, data)      => request("POST",  `${cp}/fleet/fuel`,                                data,      { authToken: token });
export const updateFleetFuelLog            = (token, id, data)  => request("PUT",   `${cp}/fleet/fuel/${id}`,                          data,      { authToken: token });
export const deleteFleetFuelLog            = (token, id)        => request("DELETE",`${cp}/fleet/fuel/${id}`,                          undefined, { authToken: token });
export const getFleetMaintenance           = (token, params="") => request("GET",   `${cp}/fleet/maintenance${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const createFleetMaintenance        = (token, data)      => request("POST",  `${cp}/fleet/maintenance`,                         data,      { authToken: token });
export const updateFleetMaintenance        = (token, id, data)  => request("PUT",   `${cp}/fleet/maintenance/${id}`,                   data,      { authToken: token });
export const updateFleetMaintenanceStatus  = (token, id, status)=> request("PATCH", `${cp}/fleet/maintenance/${id}/status`,            { status }, { authToken: token });
export const deleteFleetMaintenance        = (token, id)        => request("DELETE",`${cp}/fleet/maintenance/${id}`,                   undefined, { authToken: token });
export const getFleetSubmissions           = (token)            => request("GET",   `${cp}/fleet/submissions`,                         undefined, { authToken: token });
export const getFleetSubmissionDetail      = (token, type, id)  => request("GET",   `${cp}/fleet/submissions/detail/${type}/${id}`,    undefined, { authToken: token });
export const downloadFleetSubmissionsCSV   = (token)            => {
  return fetch(buildApiUrl("/api/company-portal/fleet/submissions/export-csv"), {
    headers: { Authorization: `Bearer ${token}` },
  });
};

// â”€â”€ Soft Service Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getSoftServiceRequestsAll = (token, params = "") =>
  request("GET", `/api/soft-service/requests/all${params ? `?${params}` : ""}`, undefined, { authToken: token });
export const getSoftServiceRequestsMy  = (token, params = "") =>
  request("GET", `/api/soft-service/requests/my${params ? `?${params}` : ""}`, undefined, { authToken: token });


// ── Client Portal – Assets Export ───────────────────────────────────────────
export const getClientAssets = (token, params = '') => request('GET', '/api/companies/assets' + (params ? '?' + params : ''), undefined, { authToken: token });
