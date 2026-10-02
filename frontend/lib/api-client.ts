import { XRayReport, Doctor, RadiologyCenter, DocTemplate, UserAccount } from './radiology-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const TOKEN_KEY = 'radionline_token_v1';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function forceLogoutOnUnauthorized() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('radionline_session_v1');
  window.dispatchEvent(new Event('radionline_session_changed'));
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && endpoint !== '/auth/login') {
    forceLogoutOnUnauthorized();
    const errorText = await res.text();
    throw new Error(`API error 401: ${errorText}`);
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export interface PendingApproval {
  id: string;
  managerId: string;
  managerName: string;
  actionType: string;
  entityType: string;
  entityId?: string;
  payload: Record<string, any>;
  /** Priority 7: current DB values for before/after approval diffs */
  before?: Record<string, any> | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface RevenueSummary {
  currency: string;
  currentPeriod: string;
  currentMonth: {
    period: string;
    centerBilling: number;
    doctorPayouts: number;
    net: number;
    centerPaid: number;
    centerPending: number;
    doctorPaid: number;
    doctorPending: number;
    centerInvoiceCount: number;
    doctorInvoiceCount: number;
    currency: string;
  };
  trend: Array<{
    period: string;
    centerBilling: number;
    doctorPayouts: number;
    net: number;
    centerPaid: number;
    centerPending: number;
    doctorPaid: number;
    doctorPending: number;
  }>;
  assumption?: string;
}

export interface LoginResult {
  access_token: string;
  token_type: string;
  user: UserAccount;
}

export interface MyWorkItem extends XRayReport {
  studyCount?: number;
  workDate?: string;
}

export interface MyWorkResponse {
  items: MyWorkItem[];
  total: number;
  page: number;
  page_size: number;
  dateField?: string;
  centers?: Array<{ id: string; name: string }>;
}



export type ReportCommentKind = 'FLAG' | 'REASSIGN' | 'RECHECK' | 'COMMENT';

export interface ReportComment {
  id: number;
  caseId: string;
  studyId?: string | null;
  authorUserId?: number | null;
  authorRole: string;
  authorName: string;
  kind: ReportCommentKind | string;
  body: string;
  fromDoctorId?: string | null;
  toDoctorId?: string | null;
  createdAt: string;
}

export const ApiClient = {
  // Health
  async getHealth() {
    return fetchJson<{ status: string; service: string; database: string }>('/health');
  },

  // Auth & Users
  async login(credentials: { email: string; password: string }) {
    const result = await fetchJson<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setAccessToken(result.access_token);
    return result;
  },

  logout() {
    setAccessToken(null);
  },

  async getUsers() {
    return fetchJson<UserAccount[]>('/auth/users');
  },

  async saveUser(user: UserAccount) {
    return fetchJson<UserAccount>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  },

  // Reports
  async getReports() {
    return fetchJson<XRayReport[]>('/reports');
  },

  async getMyWork(params?: {
    status?: string;
    from?: string;
    to?: string;
    center?: string;
    page?: number;
    pageSize?: number;
  }) {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.from) q.append('from', params.from);
    if (params?.to) q.append('to', params.to);
    if (params?.center) q.append('center', params.center);
    if (params?.page != null) q.append('page', String(params.page));
    if (params?.pageSize != null) q.append('page_size', String(params.pageSize));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<MyWorkResponse>(`/reports/my-work${qs}`);
  },


  async getReportById(id: string) {
    return fetchJson<XRayReport>(`/reports/${id}`);
  },


  async getMyPartialCases() {
    return fetchJson<{ items: Array<{
      id: string;
      patientName: string;
      patientNumber: string;
      signedStudyCount: number;
      studyCount: number;
      pendingStudyCount: number;
      pendingBodyParts: string[];
    }>; total: number }>('/reports/my-partial-cases');
  },

  async saveStudyDraft(caseId: string, studyId: string, payload: {
    findings?: string;
    impression?: string;
    technique?: string;
    templateId?: string;
    clinicalNotes?: string;
    docContent?: string;
    dicomSnapshots?: string[];
  }) {
    return fetchJson<any>(`/reports/${caseId}/studies/${studyId}/draft`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async signStudyReport(caseId: string, studyId: string, payload: {
    findings?: string;
    impression?: string;
    technique?: string;
    templateId?: string;
    clinicalNotes?: string;
    docContent?: string;
    dicomSnapshots?: string[];
  }) {
    return fetchJson<{
      ok: boolean;
      toast: string;
      studyId: string;
      bodyPart: string;
      reportStatus: string;
      nextStudyId?: string | null;
      nextBodyPart?: string | null;
      caseComplete: boolean;
      signedStudyCount: number;
      studyCount: number;
      pendingStudyCount: number;
      billing?: any;
      notified?: boolean;
      report?: XRayReport;
    }>(`/reports/${caseId}/studies/${studyId}/sign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },


  async saveReport(report: Partial<XRayReport>) {
    return fetchJson<XRayReport>('/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  },

  async claimReport(reportId: string, doctorId: string, doctorName: string) {
    return fetchJson<XRayReport>(`/reports/${reportId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ doctorId, doctorName }),
    });
  },

  async rejectReport(reportId: string, doctorId: string, reason?: string) {
    return fetchJson<{ status: string; message: string }>(`/reports/${reportId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ doctorId, reason: reason || 'Doctor declined study' }),
    });
  },

  async deleteReport(id: string) {
    return fetchJson<void>(`/reports/${id}`, {
      method: 'DELETE',
    });
  },

  // Doctors
  async getDoctors() {
    return fetchJson<Doctor[]>('/doctors');
  },

  async saveDoctor(doctor: Partial<Doctor>) {
    return fetchJson<Doctor>('/doctors', {
      method: 'POST',
      body: JSON.stringify(doctor),
    });
  },

  async deleteDoctor(id: string) {
    return fetchJson<void>(`/doctors/${id}`, {
      method: 'DELETE',
    });
  },

  // Centers
  async getCenters() {
    return fetchJson<RadiologyCenter[]>('/centers');
  },

  async saveCenter(center: Partial<RadiologyCenter>) {
    return fetchJson<RadiologyCenter>('/centers', {
      method: 'POST',
      body: JSON.stringify(center),
    });
  },

  async deleteCenter(id: string) {
    return fetchJson<void>(`/centers/${id}`, {
      method: 'DELETE',
    });
  },

  // Templates
  async getTemplates() {
    return fetchJson<DocTemplate[]>('/templates');
  },

  async saveTemplate(template: Partial<DocTemplate>) {
    return fetchJson<DocTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

  async deleteTemplate(id: string) {
    return fetchJson<void>(`/templates/${id}`, {
      method: 'DELETE',
    });
  },


  async matchTemplate(modality: string, bodyPart: string): Promise<DocTemplate | null> {
    const params = new URLSearchParams({
      modality: modality.trim(),
      bodyPart: bodyPart.trim(),
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/templates/match?${params.toString()}`, {
      method: 'GET',
      headers,
    });

    if (res.status === 401) {
      forceLogoutOnUnauthorized();
      throw new Error('API error 401: Unauthorized');
    }
    if (res.status === 204 || res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API error ${res.status}: ${errorText}`);
    }
    return res.json();
  },

  // Approvals
  async getApprovals(status?: string, managerId?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (managerId) params.append('managerId', managerId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<PendingApproval[]>(`/approvals${queryString}`);
  },

  async submitApproval(data: {
    managerId: string;
    managerName: string;
    actionType: string;
    entityType: string;
    entityId?: string;
    payload: Record<string, any>;
  }) {
    return fetchJson<PendingApproval>('/approvals/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async approveChange(approvalId: string, reviewerName?: string) {
    return fetchJson<PendingApproval>(`/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reviewerName: reviewerName || 'Super Admin' }),
    });
  },

  async rejectChange(approvalId: string, rejectionReason: string, reviewerName?: string) {
    return fetchJson<PendingApproval>(`/approvals/${approvalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reviewerName: reviewerName || 'Super Admin', rejectionReason }),
    });
  },

  // Invoices & Billing
  async getPricing() {
    return fetchJson<{
      currency: string;
      center: { firstStudy: number; additionalStudy: number };
      doctor: { firstStudy: number; additionalStudy: number };
      allowedModalities: string[];
    }>('/billing/pricing');
  },

  async getBillingPeriods() {
    return fetchJson<Array<{
      period: string;
      locked: boolean;
      lockedAt?: string | null;
      lockedBy?: string | null;
      effectiveStatusHint?: string;
    }>>('/billing/periods');
  },

  async lockBillingPeriod(period: string, unlock = false) {
    return fetchJson<{ period: string; locked: boolean; invoicesFinalized?: number }>(
      '/billing/lock-period',
      {
        method: 'POST',
        body: JSON.stringify({ period, unlock }),
      }
    );
  },

  async getInvoices(params?: {
    partyType?: string;
    partyId?: string;
    period?: string;
    status?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.partyType) q.append('partyType', params.partyType);
    if (params?.partyId) q.append('partyId', params.partyId);
    if (params?.period) q.append('period', params.period);
    if (params?.status) q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchJson<any[]>(`/invoices${qs}`);
  },

  async getInvoice(id: string) {
    return fetchJson<any>(`/invoices/${id}`);
  },

  async updateInvoiceStatus(id: string, status: 'paid' | 'pending') {
    return fetchJson<any>(`/invoices/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Priority 7: Super Admin revenue

  async getRevenueSummary(months = 6) {
    return fetchJson<RevenueSummary>(`/billing/revenue?months=${months}`);
  },

  // Priority 6: case activity thread / flag-reassign / recheck
  async getReportComments(reportId: string) {
    return fetchJson<ReportComment[]>('/reports/' + reportId + '/comments');
  },

  async addReportComment(reportId: string, body: string) {
    return fetchJson<ReportComment>('/reports/' + reportId + '/comments', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },

  async flagReassignReport(reportId: string, reason: string, toDoctorId: string) {
    return fetchJson<{
      status: string;
      caseId: string;
      claimedBy: string;
      claimedByName: string;
      fromDoctorId?: string | null;
      flag: ReportComment;
      reassign: ReportComment;
    }>('/reports/' + reportId + '/flag-reassign', {
      method: 'POST',
      body: JSON.stringify({ reason, toDoctorId }),
    });
  },

  async requestRecheck(reportId: string, reason: string) {
    return fetchJson<{
      status: string;
      caseId: string;
      recheck: ReportComment;
    }>('/reports/' + reportId + '/recheck', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },


};
