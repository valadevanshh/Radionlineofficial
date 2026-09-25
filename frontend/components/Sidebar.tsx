'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  Building,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  HeartPulse,
  X,
  Eye,
  BookmarkPlus,
  Shield,
  Stethoscope,
  Radio,
  Bell,
  Check,
  Receipt,
  Wallet,
  Briefcase,
} from 'lucide-react';
import { RadiologyStore, UserAccount, XRayReport } from '@/lib/radiology-store';
import { ApiClient } from '@/lib/api-client';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [session, setSession] = useState<UserAccount | null>(null);

  useEffect(() => {
    setSession(RadiologyStore.getSession());
    const handleSessionChange = () => setSession(RadiologyStore.getSession());
    window.addEventListener('radionline_session_changed', handleSessionChange);
    return () => window.removeEventListener('radionline_session_changed', handleSessionChange);
  }, []);

  const getNavItems = () => {
    switch (session?.role) {
      case 'MANAGER':
        return [
          { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { href: '/dashboard/all-reports', label: 'All Reports', icon: FileText },
          { href: '/dashboard/document-editor', label: 'Templates', icon: BookmarkPlus },
          { href: '/dashboard/dicom-viewer', label: 'PACS Studio', icon: Eye },
          { href: '/dashboard/doctors', label: 'Doctors', icon: Users },
          { href: '/dashboard/radiology', label: 'Centers', icon: Building },
          { href: '/dashboard/approvals', label: 'My Submissions', icon: Shield },
        ];
      case 'DOCTOR':
        return [
          { href: '/dashboard/live-feed', label: 'Live Dashboard', icon: Radio, isLive: true },
          { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
          { href: '/dashboard/my-work', label: 'My Work', icon: Briefcase },
          { href: '/dashboard/all-reports', label: 'All Reports', icon: FileText },
          { href: '/dashboard/doctor-earnings', label: 'Earnings', icon: Wallet },
          { href: '/dashboard/document-editor', label: 'Templates', icon: BookmarkPlus },
          { href: '/dashboard/dicom-viewer', label: 'PACS Studio', icon: Eye },
          { href: '/dashboard/doctors', label: 'Doctors', icon: Users },
        ];
      case 'CENTER':
        return [
          { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
          { href: '/dashboard/all-reports', label: 'All Reports', icon: FileText },
          { href: '/dashboard/center-invoices', label: 'Invoices', icon: Receipt },
          { href: '/dashboard/document-editor', label: 'Templates', icon: BookmarkPlus },
          { href: '/dashboard/dicom-viewer', label: 'PACS Studio', icon: Eye },
          { href: '/dashboard/radiology', label: 'Center Info', icon: Building },
        ];
      case 'SUPER_ADMIN':
      default:
        return [
          { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { href: '/dashboard/approvals', label: 'Pending Approvals', icon: Shield },
          { href: '/dashboard/all-reports', label: 'All Reports', icon: FileText },
          { href: '/dashboard/invoices', label: 'Invoices', icon: Receipt },
          { href: '/dashboard/document-editor', label: 'Templates', icon: BookmarkPlus },
          { href: '/dashboard/dicom-viewer', label: 'PACS Studio', icon: Eye },
          { href: '/dashboard/doctors', label: 'Doctors', icon: Users },
          { href: '/dashboard/radiology', label: 'Centers', icon: Building },
        ];
    }
  };

  const navItems = getNavItems();
  const isWorkspaceRoute = pathname?.startsWith('/dashboard/workspace');

  const [logoutGuard, setLogoutGuard] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  const doLogout = () => {
    ApiClient.logout();
    RadiologyStore.logout();
    onCloseMobile?.();
    router.push('/login');
  };

  const handleLogout = async () => {
    try {
      const session = RadiologyStore.getSession?.() || RadiologyStore.getCurrentUser?.();
      const role = session?.role;
      if (role === 'DOCTOR') {
        const partial = await ApiClient.getMyPartialCases();
        if (partial?.total > 0) {
          const first = partial.items[0];
          const msg = first
            ? `${first.pendingStudyCount} of ${first.studyCount} reports for ${first.patientName} ${first.pendingStudyCount === 1 ? 'is' : 'are'} still pending. Log out anyway?`
            : `You have ${partial.total} case(s) with unfinished study reports. Log out anyway?`;
          setLogoutGuard({ open: true, message: msg });
          return;
        }
      }
    } catch (e) {
      console.warn('partial-cases check failed', e);
    }
    doLogout();
  };

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [liveReports, setLiveReports] = useState<XRayReport[]>([]);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const loadBackendReports = async () => {
    try {
      const data = await ApiClient.getReports();
      setLiveReports(data);
    } catch {
      setLiveReports(RadiologyStore.getReports());
    }
  };

  useEffect(() => {
    loadBackendReports();

    const handleReportsChange = () => loadBackendReports();
    window.addEventListener('radionline_reports_changed', handleReportsChange);

    // Live WebSocket connection for notifications
    let ws: WebSocket | null = null;
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'NEW_REPORT' || payload.type === 'REPORT_COMPLETED' || payload.type === 'REPORT_CLAIMED' || payload.type === 'REPORT_REJECTED') {
            loadBackendReports();
            if (payload.report) {
              setToastNotice(`🔔 Update: ${payload.report.fullName || 'Report'}`);
              setTimeout(() => setToastNotice(null), 4000);
            }
          }
        } catch (e) {
          console.warn('Sidebar WS parse error:', e);
        }
      };
    } catch (err) {
      console.warn('Sidebar WS error:', err);
    }

    return () => {
      window.removeEventListener('radionline_reports_changed', handleReportsChange);
      if (ws) ws.close();
    };
  }, []);


  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'Super Admin';
      case 'DOCTOR': return 'Doctor';
      case 'MANAGER': return 'Manager';
      case 'CENTER': return 'Center';
      default: return role;
    }
  };

  const getRoleBadgeChar = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'A';
      case 'DOCTOR': return 'D';
      case 'MANAGER': return 'M';
      case 'CENTER': return 'C';
      default: return 'U';
    }
  };

  const handleAcceptReport = async (report: XRayReport) => {
    const docId = session?.doctorId || 'doc-1';
    const docName = session?.name || 'DR. RADIOLOGIST';
    try {
      const updated = await ApiClient.claimReport(report.id, docId, docName);
      RadiologyStore.saveReport(updated);
      await loadBackendReports();
      setToastNotice(`Accepted study: ${report.fullName}`);
      setTimeout(() => setToastNotice(null), 3500);
      setNotificationsOpen(false);
      router.push('/dashboard/all-reports');
    } catch (err: any) {
      alert(err.message || 'Study already accepted by another radiologist.');
      loadBackendReports();
    }
  };

  const handleRejectReport = async (report: XRayReport) => {
    const docId = session?.doctorId || 'doc-1';
    try {
      await ApiClient.rejectReport(report.id, docId, session?.name);
    } catch (err) {
      console.warn('Reject notice error:', err);
    }
    setRejectedIds((prev) => [...prev, report.id]);
    setToastNotice(`Dismissed ${report.fullName}`);
    setTimeout(() => setToastNotice(null), 3000);
  };

  const pendingNotifications = liveReports.filter((r) => {
    if (session?.role === 'DOCTOR') {
      if (rejectedIds.includes(r.id)) return false;
      if (r.claimStatus === 'CLAIMED') return false;
      const docId = session?.doctorId || 'doc-1';
      return (
        !r.assignedDoctorIds ||
        r.assignedDoctorIds.includes('ALL') ||
        r.assignedDoctorIds.includes(docId) ||
        r.assignedDoctorId === docId ||
        r.assignedDoctorId === 'ALL'
      );
    }
    if (session?.role === 'CENTER') {
      if (rejectedIds.includes(r.id)) return false;
      return (
        r.status === 'Completed' &&
        (!session?.centerId || r.radiologyCenterId === session.centerId)
      );
    }
    if (session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER') {
      return r.status === 'Completed';
    }
    return false;
  });

  const SidebarContent = (
    <aside
      className="bg-white border-r border-slate-200 relative"
      style={{
        width: collapsed ? 52 : 210,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.18s ease-in-out',
        userSelect: 'none',
      }}
    >
      {/* Brand Header & Toggle */}
      <div
        className="border-b border-slate-200 flex items-center justify-between"
        style={{
          height: 44,
          padding: collapsed ? '0 12px' : '0 12px',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: '#009ef7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 4px rgba(0,158,247,0.25)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
              RX
            </span>
          </div>
          {!collapsed && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}
            >
              RadioNet PACS
            </span>
          )}
        </div>

        {/* Top Collapse Toggle Icon */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation list */}
      <nav
        style={{
          flex: 1,
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onCloseMobile?.()}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-sky-50 text-[#009ef7] font-bold border-l-3 border-[#009ef7]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '8px 0' : '7px 10px',
              }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={16} className={`shrink-0 ${isActive ? 'text-[#009ef7]' : 'text-slate-500'}`} />
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0 }}>
                  <span className="truncate">{item.label}</span>
                  {'isLive' in item && item.isLive && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#ef4444', color: '#ffffff', padding: '1px 5px', borderRadius: 8, letterSpacing: '0.5px', marginLeft: 4 }}>
                      LIVE
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section: Notifications + User Profile + Logout */}
      <div
        className="border-t border-slate-200 bg-slate-50/80 p-2 flex flex-col gap-1.5 shrink-0 relative"
      >
        {/* Toast Notice Banner if any */}
        {toastNotice && (
          <div className="absolute -top-12 left-2 right-2 bg-slate-900 text-white text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl z-50 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
            <span className="truncate">{toastNotice}</span>
            <button onClick={() => setToastNotice(null)} className="text-slate-400 hover:text-white ml-2">
              <X size={12} />
            </button>
          </div>
        )}

        {/* 1. Notifications Button & Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
                          }}
            className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-bold transition-all border ${
              notificationsOpen
                ? 'bg-sky-50 text-[#009ef7] border-[#009ef7]/40'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            title="Notifications"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <Bell size={16} className={pendingNotifications.length > 0 ? 'text-[#009ef7]' : 'text-slate-500'} />
              {pendingNotifications.length > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center px-0.5 border border-white">
                  {pendingNotifications.length}
                </span>
              )}
            </div>
            {!collapsed && (
              <span className="truncate">Notifications ({pendingNotifications.length})</span>
            )}
          </button>

          {/* Notifications Popover */}
          {notificationsOpen && (
            <div
              className="absolute left-full bottom-0 ml-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-slate-900">
                  Notifications ({pendingNotifications.length})
                </span>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-2">
                {pendingNotifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 italic">
                    No active notifications
                  </div>
                ) : (
                  pendingNotifications.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">
                            {session?.role === 'CENTER' ? `Report Signed: ${rep.fullName}` : rep.radiologyCenterName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {rep.fullName} ({rep.patientNumber})
                          </div>
                        </div>
                        <span className="font-mono text-[9px] text-slate-400 font-bold">
                          {rep.studyDate}
                        </span>
                      </div>

                      {session?.role === 'DOCTOR' && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAcceptReport(rep)}
                            className="flex-1 py-1 px-2 bg-[#009ef7] hover:bg-[#008be0] text-white text-[10px] font-bold rounded flex items-center justify-center gap-1"
                          >
                            <Check size={12} />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectReport(rep)}
                            className="py-1 px-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. User Profile (role fixed to logged-in account) */}
        <div className="relative">
          <div
            className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold border bg-white text-slate-800 border-slate-200"
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            title={session ? `Signed in as ${getRoleLabel(session.role)} (${session.name})` : 'Not signed in'}
          >
            <div
              className="w-6 h-6 rounded-md bg-[#009ef7] text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0"
            >
              {session ? getRoleBadgeChar(session.role) : '?'}
            </div>
            {!collapsed && (
              <div className="flex items-center justify-between w-full min-w-0">
                <div className="truncate text-left leading-tight">
                  <div className="truncate font-bold text-slate-900 text-[11px]">{session?.name || 'Not signed in'}</div>
                  <div className="text-[10px] text-slate-500 font-mono font-semibold">{session ? getRoleLabel(session.role) : ''}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Sign Out Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 w-full p-2 rounded-lg text-xs font-bold text-slate-700 hover:text-rose-600 hover:bg-rose-50 border border-transparent transition-colors"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          title="Sign Out"
        >
          <LogOut size={16} className="shrink-0 text-slate-500" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden-mobile" style={{ display: 'flex', height: '100%' }}>
        {SidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <>
          <div
            onClick={onCloseMobile}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 299,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              width: 210,
              zIndex: 300,
              display: 'flex',
            }}
          >
            {SidebarContent}
          </div>
        
      {logoutGuard.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 text-slate-900">
            <h3 className="text-lg font-bold mb-2">Unfinished reports</h3>
            <p className="text-sm text-slate-600 mb-4">{logoutGuard.message}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded-lg border text-sm font-semibold" onClick={() => setLogoutGuard({ open: false, message: '' })}>Stay</button>
              <button type="button" className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold" onClick={doLogout}>Leave anyway</button>
            </div>
          </div>
        </div>
      )}

    </>
      )}

      {/* Mobile Bottom Tab Bar — hidden on case workspace */}
      {!isWorkspaceRoute && (
      <div
        className="mobile-tabbar bg-white border-t border-slate-200 shadow-lg"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'none',
          zIndex: 100,
          height: 48,
        }}
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onCloseMobile?.()}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 2px',
                gap: 2,
                color: isActive ? '#009ef7' : '#64748b',
                fontSize: 9,
                fontWeight: isActive ? 700 : 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textDecoration: 'none',
              }}
            >
              <Icon size={16} />
              <span style={{ fontSize: 9 }}>{item.label}</span>
            </Link>
          );
        })}
      </div>
      )}
    </>
  );
}
