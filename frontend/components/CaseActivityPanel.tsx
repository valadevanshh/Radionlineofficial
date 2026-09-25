'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Flag, MessageSquare, RefreshCw, Send, X, AlertTriangle } from 'lucide-react';
import { ApiClient, ReportComment } from '@/lib/api-client';
import { Doctor, RadiologyStore, UserAccount, XRayReport } from '@/lib/radiology-store';

interface CaseActivityPanelProps {
  report: XRayReport;
  open: boolean;
  onClose: () => void;
  onClaimUpdated?: (claimedBy: string, claimedByName: string) => void;
}

function kindLabel(kind: string) {
  switch (kind) {
    case 'FLAG':
      return 'Flag';
    case 'REASSIGN':
      return 'Reassign';
    case 'RECHECK':
      return 'Recheck';
    case 'COMMENT':
      return 'Comment';
    default:
      return kind;
  }
}

function kindBadgeClass(kind: string) {
  switch (kind) {
    case 'FLAG':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'REASSIGN':
      return 'bg-violet-100 text-violet-800 border-violet-300';
    case 'RECHECK':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

export default function CaseActivityPanel({
  report,
  open,
  onClose,
  onClaimUpdated,
}: CaseActivityPanelProps) {
  const [session, setSession] = useState<UserAccount | null>(null);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [toDoctorId, setToDoctorId] = useState('');
  const [recheckReason, setRecheckReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(RadiologyStore.getSession());
    const onSession = () => setSession(RadiologyStore.getSession());
    window.addEventListener('radionline_session_changed', onSession);
    return () => window.removeEventListener('radionline_session_changed', onSession);
  }, []);

  const load = useCallback(async () => {
    if (!report?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [thread, docs] = await Promise.all([
        ApiClient.getReportComments(report.id),
        ApiClient.getDoctors().catch(() => [] as Doctor[]),
      ]);
      setComments(thread);
      setDoctors(docs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [report?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !report?.id) return;
    let ws: WebSocket | null = null;
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            (payload.type === 'CASE_THREAD_UPDATED' ||
              payload.type === 'REPORT_REASSIGNED' ||
              payload.type === 'REPORT_RECHECK') &&
            (payload.caseId === report.id || payload.reportId === report.id)
          ) {
            load();
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
    return () => {
      if (ws) ws.close();
    };
  }, [open, report?.id, load]);

  if (!open) return null;

  const role = session?.role;
  const canFlag =
    role === 'CENTER' || role === 'MANAGER' || role === 'SUPER_ADMIN';
  const isOwningDoctor =
    role === 'DOCTOR' &&
    !!session?.doctorId &&
    (report.claimedByDoctorId === session.doctorId ||
      report.assignedDoctorId === session.doctorId);
  const canRecheck = isOwningDoctor && report.status === 'Completed';
  const canComment =
    role === 'CENTER' ||
    role === 'MANAGER' ||
    role === 'SUPER_ADMIN' ||
    role === 'DOCTOR';

  const handleAddComment = async () => {
    if (!commentBody.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ApiClient.addReportComment(report.id, commentBody.trim());
      setCommentBody('');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setBusy(false);
    }
  };

  const handleFlagReassign = async () => {
    if (!flagReason.trim() || !toDoctorId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ApiClient.flagReassignReport(
        report.id,
        flagReason.trim(),
        toDoctorId
      );
      setFlagReason('');
      onClaimUpdated?.(result.claimedBy, result.claimedByName);
      window.dispatchEvent(new Event('radionline_reports_changed'));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Flag & reassign failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRecheck = async () => {
    if (!recheckReason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ApiClient.requestRecheck(report.id, recheckReason.trim());
      setRecheckReason('');
      window.dispatchEvent(new Event('radionline_reports_changed'));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recheck request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col print:hidden">
      <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare size={16} className="text-[#009ef7] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-slate-900 truncate">Case Activity</div>
            <div className="text-[10px] font-mono text-slate-500 truncate">
              {report.fullName} · {report.patientNumber}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={load}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 text-[11px] text-rose-700 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/50">
        {loading && comments.length === 0 ? (
          <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider text-center py-8">
            Loading thread...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-8">
            No flags, rechecks, or comments yet.
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200 rounded-md p-2.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${kindBadgeClass(
                    c.kind
                  )}`}
                >
                  {kindLabel(c.kind)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate">
                  {c.createdAt?.replace('T', ' ').replace('Z', '')}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-800">
                {c.authorName}{' '}
                <span className="font-normal text-slate-400">({c.authorRole})</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap break-words">{c.body}</p>
              {(c.fromDoctorId || c.toDoctorId) && (
                <div className="text-[10px] text-slate-500 mt-1 font-mono">
                  {c.fromDoctorId ? `from ${c.fromDoctorId}` : ''}
                  {c.fromDoctorId && c.toDoctorId ? ' → ' : ''}
                  {c.toDoctorId ? `to ${c.toDoctorId}` : ''}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 p-3 space-y-3 bg-white shrink-0 max-h-[45%] overflow-y-auto">
        {canFlag && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 uppercase tracking-tight">
              <Flag size={12} className="text-amber-600" />
              Flag &amp; Reassign
            </div>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason required..."
              rows={2}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:border-[#009ef7] resize-none"
            />
            <select
              value={toDoctorId}
              onChange={(e) => setToDoctorId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:border-[#009ef7] bg-white"
            >
              <option value="">Select doctor...</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !flagReason.trim() || !toDoctorId}
              onClick={handleFlagReassign}
              className="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase"
            >
              Flag &amp; Reassign
            </button>
          </div>
        )}

        {canRecheck && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">
              Request Recheck
            </div>
            <textarea
              value={recheckReason}
              onChange={(e) => setRecheckReason(e.target.value)}
              placeholder="Recheck reason required..."
              rows={2}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:border-[#009ef7] resize-none"
            />
            <button
              type="button"
              disabled={busy || !recheckReason.trim()}
              onClick={handleRecheck}
              className="w-full py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase"
            >
              Request Recheck
            </button>
          </div>
        )}

        {canComment && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">
              Add Comment
            </div>
            <div className="flex gap-1.5">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Follow-up note..."
                rows={2}
                className="flex-1 text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:border-[#009ef7] resize-none"
              />
              <button
                type="button"
                disabled={busy || !commentBody.trim()}
                onClick={handleAddComment}
                className="px-3 rounded bg-[#009ef7] hover:bg-[#008be0] disabled:opacity-50 text-white"
                title="Send comment"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
