'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Users,
  Building,
  ArrowRight,
  CheckCircle2,
  Clock,
  BookmarkPlus,
  Eye,
  Activity,
  AlertTriangle,
  FileEdit,
  Plus,
  FolderOpen,
  Wallet,
} from 'lucide-react';
import { RadiologyStore, XRayReport, formatDateDDMMYYYY, UserAccount } from '@/lib/radiology-store';
import { ApiClient, RevenueSummary } from '@/lib/api-client';
import DataTape, { Metric } from '@/components/DataTape';
import NewXRayReportModal from '@/components/NewXRayReportModal';
import { useResizableColumns } from '@/lib/use-resizable-columns';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';

export default function DashboardOverviewPage() {
  const [reports, setReports] = useState<XRayReport[]>([]);
  const [doctorCount, setDoctorCount] = useState<number>(0);
  const [isNewReportModalOpen, setIsNewReportModalOpen] = useState<boolean>(false);
  const [session, setSession] = useState<UserAccount | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const router = useRouter();

  const openWorkspace = (report: XRayReport) => {
    router.push(`/dashboard/workspace/${report.id}`);
  };

  const { widths, startResizing } = useResizableColumns({
    patient: 150,
    center: 150,
    bodyParts: 120,
    status: 80,
    studyDate: 90,
    actions: 110,
  });

  const loadDashboardData = async () => {
    const sess = RadiologyStore.getSession();
    setSession(sess);
    try {
      const [reps, docs] = await Promise.all([
        ApiClient.getReports(),
        ApiClient.getDoctors(),
      ]);
      setReports(reps);
      setDoctorCount(docs.length);
    } catch {
      setReports(RadiologyStore.getReports());
      setDoctorCount(RadiologyStore.getDoctors().length);
    }

    // Priority 7: Super Admin monthly revenue from real invoice tables only
    if (sess?.role === 'SUPER_ADMIN') {
      try {
        const rev = await ApiClient.getRevenueSummary(6);
        setRevenue(rev);
        setRevenueError(null);
      } catch (err: any) {
        setRevenue(null);
        setRevenueError(err?.message || 'Failed to load revenue');
      }
    } else {
      setRevenue(null);
      setRevenueError(null);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const handleReportsChanged = () => loadDashboardData();
    window.addEventListener('radionline_reports_changed', handleReportsChanged);
    return () => window.removeEventListener('radionline_reports_changed', handleReportsChanged);
  }, []);

  const completedCount = reports.filter((r) => r.status === 'Completed').length;
  const pendingCount = reports.filter((r) => r.status !== 'Completed').length;
  const urgentCount = reports.filter((r) => r.isUrgent && r.status !== 'Completed').length;

  const metrics: Metric[] = [
    { label: 'TOTAL CASES', value: String(reports.length), delta: 'Live', trend: 'up', color: 'navy' },
    { label: 'COMPLETED', value: String(completedCount), delta: 'Live', trend: 'up', color: 'teal' },
    { label: 'PENDING REVIEW', value: String(pendingCount), delta: 'Live', trend: 'down', color: 'amber' },
    { label: 'STAT URGENT', value: String(urgentCount), delta: 'STAT', trend: 'neutral', color: 'red' },
    { label: 'RADIOLOGISTS', value: String(doctorCount), delta: 'Online', trend: 'up', color: 'blue' },
  ];

  const handleSaveNewReport = async (reportData: Omit<XRayReport, 'id' | 'createdAt'>) => {
    try {
      const saved = await ApiClient.saveReport(reportData);
      RadiologyStore.saveReport(saved);
    } catch (err) {
      console.warn('API save report error:', err);
      RadiologyStore.saveReport(reportData);
    }
    setIsNewReportModalOpen(false);
    loadDashboardData();
  };

  const pendingReports = reports
    .filter((r) => r.status === 'Pending')
    .sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));

  const sortedReports = [...reports].sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900">
      {/* Sleek Minimal Top Action & Telemetry Strip */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-1.5 bg-[#009ef7]/10 text-[#009ef7] border border-[#009ef7]/20 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-900 font-mono uppercase tracking-tight">
              Radiology Portal Overview
            </h1>
          </div>

          {/* High-Density Inline Metric Chips (No Bloated Cards) */}
          <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded border border-slate-200">
              TOTAL: <strong className="text-slate-900">{reports.length}</strong>
            </span>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-200">
              COMPLETED: <strong>{completedCount}</strong>
            </span>
            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 font-bold rounded border border-amber-200">
              PENDING: <strong>{pendingCount}</strong>
            </span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-rose-600 text-white font-bold rounded animate-pulse">
                STAT URGENT: <strong>{pendingCount}</strong>
              </span>
            )}
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded border border-indigo-200">
              RADIOLOGISTS: <strong>{doctorCount}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/dashboard/all-reports"
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold font-mono rounded-lg transition-colors border border-slate-200 inline-flex items-center gap-1"
          >
            <span>All Reports ({reports.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setIsNewReportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-2xs cursor-pointer font-mono shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {/* Priority 7: Super Admin monthly revenue (real invoice totals) */}
      {session?.role === 'SUPER_ADMIN' && (
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span className="text-[11px] font-extrabold font-mono uppercase tracking-tight text-slate-800">
                Monthly Revenue
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {revenue?.currentPeriod || '-'} | IST
              </span>
            </div>
            <Link
              href="/dashboard/invoices"
              className="text-[10px] font-bold font-mono text-[#009ef7] hover:underline inline-flex items-center gap-1"
            >
              Invoices <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {revenueError && (
            <div className="text-[11px] text-rose-600 font-mono">{revenueError}</div>
          )}
          {revenue && (
            <>
              <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                <span className="px-2 py-0.5 bg-sky-50 text-sky-800 font-bold rounded border border-sky-200" title="Sum of center invoice totals this month">
                  CENTER BILLING: <strong>₹{revenue.currentMonth.centerBilling}</strong>
                </span>
                <span className="px-2 py-0.5 bg-violet-50 text-violet-800 font-bold rounded border border-violet-200" title="Sum of doctor payout invoice totals this month">
                  DOCTOR PAYOUTS: <strong>₹{revenue.currentMonth.doctorPayouts}</strong>
                </span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 font-bold rounded border border-emerald-200" title="Center billing minus doctor payouts">
                  NET: <strong>₹{revenue.currentMonth.net}</strong>
                </span>
                <span className="px-2 py-0.5 bg-slate-50 text-slate-700 font-bold rounded border border-slate-200">
                  CENTER PAID: <strong>₹{revenue.currentMonth.centerPaid}</strong>
                  <span className="text-slate-400 mx-1">|</span>
                  PENDING: <strong>₹{revenue.currentMonth.centerPending}</strong>
                </span>
                <span className="px-2 py-0.5 bg-slate-50 text-slate-700 font-bold rounded border border-slate-200">
                  DOCTOR PAID: <strong>₹{revenue.currentMonth.doctorPaid}</strong>
                  <span className="text-slate-400 mx-1">|</span>
                  PENDING: <strong>₹{revenue.currentMonth.doctorPending}</strong>
                </span>
              </div>
              {revenue.trend && revenue.trend.length > 1 && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-slate-600">
                  <span className="font-bold text-slate-500 uppercase">Trend:</span>
                  {[...revenue.trend].reverse().map((t) => (
                    <span
                      key={t.period}
                      className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200"
                      title={`Center ₹${t.centerBilling} · Doctor ₹${t.doctorPayouts} · Net ₹${t.net}`}
                    >
                      {t.period}: <strong>₹{t.net}</strong>
                    </span>
                  ))}
                </div>
              )}
              {revenue.assumption && (
                <div className="mt-1 text-[9px] text-slate-400 font-mono leading-snug">{revenue.assumption}</div>
              )}
            </>
          )}
          {!revenue && !revenueError && (
            <div className="text-[11px] text-slate-400 font-mono">Loading revenue from invoices…</div>
          )}
        </div>
      )}

      {/* STAT Urgent Review Banner (Compact 1-line Strip if Urgent cases exist) */}
      {pendingReports.length > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 font-mono overflow-hidden">
            <span className="px-1.5 py-0.5 bg-rose-600 text-white font-bold text-[9px] rounded uppercase animate-pulse shrink-0">
              STAT URGENT ({pendingReports.length})
            </span>
            <span className="font-bold text-rose-900 truncate">
              {pendingReports[0].fullName} ({pendingReports[0].patientNumber}) — {pendingReports[0].radiologyCenterName}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openWorkspace(pendingReports[0])}
              className="btn-pacs"
            >
              <Eye className="w-3.5 h-3.5 text-[#009ef7]" />
              <span>PACS</span>
            </button>
            <button
              type="button"
              onClick={() => openWorkspace(pendingReports[0])}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded"
            >
              Report
            </button>
          </div>
        </div>
      )}

      {/* Main Full-Height Clinical Patient Studies Data Table (Zero Bloated Cards) */}
      <div className="flex-1 data-table-container overflow-y-auto bg-white">
        {reports.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th title="Patient Information" style={{ width: widths.patient, position: 'relative' }}>
                  <span>Patient Information</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('patient', e.clientX, widths.patient)} />
                </th>
                <th title="Diagnostic Center" style={{ width: widths.center, position: 'relative' }}>
                  <span>Diagnostic Center</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('center', e.clientX, widths.center)} />
                </th>
                <th title="Modality / Body Parts" style={{ width: widths.bodyParts, position: 'relative' }}>
                  <span>Modality / Body Parts</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('bodyParts', e.clientX, widths.bodyParts)} />
                </th>
                <th title="Status" style={{ width: widths.status, position: 'relative' }}>
                  <span>Status</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('status', e.clientX, widths.status)} />
                </th>
                <th title="Study Date" style={{ width: widths.studyDate, position: 'relative' }}>
                  <span>Study Date</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('studyDate', e.clientX, widths.studyDate)} />
                </th>
                <th title="Actions" style={{ width: widths.actions, textAlign: 'right', position: 'relative' }}>
                  <span>Actions</span>
                  <div className="col-resizer" onMouseDown={(e) => startResizing('actions', e.clientX, widths.actions)} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedReports.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-50/80 transition-colors ${r.isUrgent ? 'bg-rose-50/20' : ''}`}>
                  <td title={`${r.fullName} (${r.patientNumber})`} className="p-3">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{r.fullName}</span>
                      {r.isUrgent && (
                        <span className="px-1.5 py-0.5 bg-rose-600 text-white font-mono font-bold text-[9px] rounded uppercase animate-pulse">
                          STAT URGENT
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      {r.patientNumber} • {r.gender}/{r.age}y
                    </div>
                  </td>
                  <td title={r.radiologyCenterName} className="p-3 text-slate-600 font-medium">
                    {r.radiologyCenterName}
                  </td>
                  <td title={r.bodyParts.join(', ')} className="p-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded border border-slate-200">
                      {r.bodyParts.join(', ')}
                    </span>
                  </td>
                  <td title={r.status} className="p-3">
                    <StatusBadge
                      status={r.status}
                      isPartial={
                        r.isPartial ||
                        ((r.signedStudyCount ?? 0) > 0 &&
                          (r.signedStudyCount ?? 0) < (r.studyCount ?? r.bodyParts?.length ?? 0))
                      }
                    />
                  </td>
                  <td title={formatDateDDMMYYYY(r.studyDate)} className="p-3 font-mono text-slate-500 text-[11px]">
                    {formatDateDDMMYYYY(r.studyDate)}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openWorkspace(r)}
                        className="btn-pacs"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#009ef7]" />
                        <span>PACS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openWorkspace(r)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded transition-colors inline-flex items-center gap-1"
                      >
                        <FileEdit className="w-3 h-3" />
                        <span>Report</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center flex flex-col items-center justify-center my-6">
            <div className="w-14 h-14 bg-[#009ef7]/10 border border-[#009ef7]/20 rounded-full flex items-center justify-center mb-3 text-[#009ef7]">
              <FolderOpen className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight font-mono uppercase">
              No Patient Studies Recorded Yet
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-5">
              Start testing your real-world teleradiology workflow by creating a new X-ray patient record or connecting a diagnostic center.
            </p>
            <button
              type="button"
              onClick={() => setIsNewReportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer font-mono"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Case</span>
            </button>
          </div>
        )}
      </div>

      {/* New X-Ray Patient Report Modal */}
      {isNewReportModalOpen && (
        <NewXRayReportModal
          isOpen={isNewReportModalOpen}
          onClose={() => setIsNewReportModalOpen(false)}
          onSave={handleSaveNewReport}
        />
      )}
    </div>
  );
}
