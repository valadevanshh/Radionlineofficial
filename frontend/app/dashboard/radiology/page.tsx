'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Building,
  Search,
  Plus,
  Mail,
  Phone,
  CheckCircle,
  MapPin,
  Trash2,
} from 'lucide-react';
import { RadiologyStore, RadiologyCenter } from '@/lib/radiology-store';
import AddRadiologyCenterModal from '@/components/AddRadiologyCenterModal';
import { ApiClient } from '@/lib/api-client';

import { useResizableColumns } from '@/lib/use-resizable-columns';

export default function RadiologyCentersPage() {
  const [centers, setCenters] = useState<RadiologyCenter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { widths, startResizing } = useResizableColumns({
    centerName: 200,
    contact: 190,
    credentials: 230,
    headerBanner: 120,
    status: 90,
    actions: 70,
  });

  const loadCenters = async () => {
    try {
      const data = await ApiClient.getCenters();
      setCenters(data);
    } catch {
      setCenters(RadiologyStore.getCenters());
    }
  };

  useEffect(() => {
    loadCenters();
    const handleCentersChanged = () => loadCenters();
    window.addEventListener('radionline_centers_changed', handleCentersChanged);
    return () => window.removeEventListener('radionline_centers_changed', handleCentersChanged);
  }, []);

  const filteredCenters = useMemo(() => {
    return centers.filter(
      (c) =>
        c.centerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contactNumber.includes(searchQuery)
    );
  }, [centers, searchQuery]);

  const handleAddCenter = async (center: Omit<RadiologyCenter, 'id' | 'createdAt'>) => {
    const session = RadiologyStore.getSession();
    if (session.role === 'MANAGER') {
      try {
        await ApiClient.submitApproval({
          managerId: session.email,
          managerName: session.name,
          actionType: 'CREATE_CENTER',
          entityType: 'center',
          payload: center as Record<string, any>,
        });
        alert('Center registration request submitted to Super Admin for approval.');
      } catch (err: any) {
        alert('Failed to submit approval: ' + err.message);
      }
      return;
    }

    try {
      const saved = await ApiClient.saveCenter(center);
      RadiologyStore.saveCenter(saved);
    } catch (err) {
      console.warn('API save center error:', err);
      RadiologyStore.saveCenter(center);
    }
    loadCenters();
  };

  const handleDeleteCenter = async (id: string) => {
    const session = RadiologyStore.getSession();
    if (session.role === 'MANAGER') {
      const target = centers.find((c) => c.id === id);
      try {
        await ApiClient.submitApproval({
          managerId: session.email,
          managerName: session.name,
          actionType: 'DELETE_CENTER',
          entityType: 'center',
          entityId: id,
          payload: target ? (target as Record<string, any>) : { id },
        });
        alert('Center deletion request submitted to Super Admin for approval.');
      } catch (err: any) {
        alert('Failed to submit approval: ' + err.message);
      }
      return;
    }

    if (confirm('Are you sure you want to remove this Radiology Diagnostic Center?')) {
      try {
        await ApiClient.deleteCenter(id);
      } catch (err) {
        console.warn('API delete center error:', err);
      }
      RadiologyStore.deleteCenter(id);
      loadCenters();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 space-y-3 max-w-7xl w-full mx-auto">
        
        {/* Page Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2 font-mono">
              <Building className="w-5 h-5 text-[#009ef7]" />
              <span>Diagnostic Radiology Centers</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer shrink-0 font-mono"
          >
            <Plus className="w-4 h-4" />
            <span>Add Center</span>
          </button>
        </div>

        {/* Filter Toolbar & Data Card */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
          
          {/* Search Filter Strip */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4 flex-wrap shrink-0">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by center name, email, or contact number..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs focus:outline-none focus:border-[#009ef7]"
              />
            </div>
            <div className="text-xs font-mono text-slate-500 font-bold">
              {filteredCenters.length} {filteredCenters.length === 1 ? 'CENTER' : 'CENTERS'}
            </div>
          </div>

          {/* Table / Empty Slate Body (No Horizontal Scroll, Resizable Columns, Internal Vertical Scroll) */}
          <div className="data-table-container flex-1 overflow-y-auto">
            {filteredCenters.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th title="Center Name" style={{ width: widths.centerName, position: 'relative' }}>
                      <span>Center Name</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('centerName', e.clientX, widths.centerName)} />
                    </th>
                    <th title="Contact Info" style={{ width: widths.contact, position: 'relative' }}>
                      <span>Contact Info</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('contact', e.clientX, widths.contact)} />
                    </th>
                    <th title="Login Credentials" style={{ width: widths.credentials, position: 'relative' }}>
                      <span>Login Credentials</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('credentials', e.clientX, widths.credentials)} />
                    </th>
                    <th title="Header Banner" style={{ width: widths.headerBanner, position: 'relative' }}>
                      <span>Header Banner</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('headerBanner', e.clientX, widths.headerBanner)} />
                    </th>
                    <th title="Status" style={{ width: widths.status, position: 'relative' }}>
                      <span>Status</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('status', e.clientX, widths.status)} />
                    </th>
                    <th title="Actions" style={{ width: widths.actions, textAlign: 'right', position: 'relative' }}>
                      <span>Actions</span>
                      <div className="col-resizer" onMouseDown={(e) => startResizing('actions', e.clientX, widths.actions)} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCenters.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td title={`${c.centerName} (${c.address || 'Main Location'})`} className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#009ef7]/10 border border-[#009ef7]/20 flex items-center justify-center font-bold text-[#009ef7] text-sm shrink-0 font-mono">
                            {c.centerName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{c.centerName}</div>
                            <div className="text-[11px] text-slate-500">{c.address || 'Main Location'}</div>
                          </div>
                        </div>
                      </td>
                      <td title={`${c.email} | ${c.contactNumber}`} className="p-3.5">
                        <div className="font-semibold text-slate-800">{c.email}</div>
                        <div className="font-mono text-[11px] text-slate-500">{c.contactNumber}</div>
                      </td>
                      <td title={`User: ${c.username || c.email} | Pass: ${c.password || 'N/A'}`} className="p-3.5">
                        <div className="font-mono text-[11px] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded inline-flex gap-3 text-slate-700">
                          <span>USER: <strong>{c.username || c.email}</strong></span>
                          <span>PASS: <strong>{c.password || 'N/A'}</strong></span>
                        </div>
                      </td>
                      <td title={c.headerTemplateUrl ? 'Custom Banner' : 'Default Header'} className="p-3.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded font-mono border border-slate-200">
                          {c.headerTemplateUrl ? 'Custom Banner' : 'Default Header'}
                        </span>
                      </td>
                      <td title="Active" className="p-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded font-mono">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Active</span>
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteCenter(c.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded hover:bg-rose-50"
                          title="Delete Radiology Center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* Wowed Empty State Card */
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-[#009ef7]/10 border border-[#009ef7]/20 rounded-full flex items-center justify-center mb-4 text-[#009ef7]">
                  <Building className="w-8 h-8" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight font-mono">
                  No Diagnostic Centers Registered Yet
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 mb-6">
                  Add your diagnostic center profiles to upload letterheads and create center login credentials.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Radiology Center</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>

      <AddRadiologyCenterModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddCenter}
      />
    </div>
  );
}
