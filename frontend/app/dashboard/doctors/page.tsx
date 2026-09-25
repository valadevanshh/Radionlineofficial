'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  CheckCircle,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { RadiologyStore, Doctor } from '@/lib/radiology-store';
import AddDoctorModal from '@/components/AddDoctorModal';
import { ApiClient } from '@/lib/api-client';
import { useConfirm } from '@/components/ui';

import { useResizableColumns } from '@/lib/use-resizable-columns';

export default function DoctorsPage() {
  const confirm = useConfirm();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { widths, startResizing } = useResizableColumns({
    name: 220,
    contact: 200,
    credentials: 260,
    status: 90,
    actions: 80,
  });

  const loadDoctors = async () => {
    try {
      const data = await ApiClient.getDoctors();
      setDoctors(data);
    } catch {
      setDoctors(RadiologyStore.getDoctors());
    }
  };

  useEffect(() => {
    loadDoctors();
    const handleDoctorsChanged = () => loadDoctors();
    window.addEventListener('radionline_doctors_changed', handleDoctorsChanged);
    return () => window.removeEventListener('radionline_doctors_changed', handleDoctorsChanged);
  }, []);

  const filteredDoctors = useMemo(() => {
    return doctors.filter(
      (d) =>
        d.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.contactNumber.includes(searchQuery)
    );
  }, [doctors, searchQuery]);

  const handleAddDoctor = async (doctor: Omit<Doctor, 'id' | 'createdAt'>) => {
    const session = RadiologyStore.getSession();
    if (session.role === 'MANAGER') {
      try {
        await ApiClient.submitApproval({
          managerId: session.email,
          managerName: session.name,
          actionType: 'CREATE_DOCTOR',
          entityType: 'doctor',
          payload: doctor as Record<string, any>,
        });
        alert('Doctor registration request submitted to Super Admin for approval.');
      } catch (err: any) {
        alert('Failed to submit approval: ' + err.message);
      }
      return;
    }

    try {
      const saved = await ApiClient.saveDoctor(doctor);
      RadiologyStore.saveDoctor(saved);
    } catch (err) {
      console.warn('API save doctor error:', err);
      RadiologyStore.saveDoctor(doctor);
    }
    loadDoctors();
  };

  const handleDeleteDoctor = async (id: string) => {
    const session = RadiologyStore.getSession();
    if (session.role === 'MANAGER') {
      const target = doctors.find((d) => d.id === id);
      try {
        await ApiClient.submitApproval({
          managerId: session.email,
          managerName: session.name,
          actionType: 'DELETE_DOCTOR',
          entityType: 'doctor',
          entityId: id,
          payload: target ? (target as Record<string, any>) : { id },
        });
        alert('Doctor deletion request submitted to Super Admin for approval.');
      } catch (err: any) {
        alert('Failed to submit approval: ' + err.message);
      }
      return;
    }

    const ok = await confirm({
      title: 'Delete doctor profile',
      message: 'Are you sure you want to delete this doctor profile?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await ApiClient.deleteDoctor(id);
    } catch (err) {
      console.warn('API delete doctor error:', err);
    }
    RadiologyStore.deleteDoctor(id);
    loadDoctors();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 space-y-3 max-w-7xl w-full mx-auto">
        
        {/* Page Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2 font-mono">
              <Users className="w-5 h-5 text-[#009ef7]" />
              <span>Radiologists & Doctors Directory</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer shrink-0 font-mono"
          >
            <Plus className="w-4 h-4" />
            <span>Add Doctor</span>
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
                placeholder="Search doctor by name, email, or phone..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 bg-white text-slate-900 rounded-lg text-xs focus:outline-none focus:border-[#009ef7]"
              />
            </div>
            <div className="text-xs font-mono text-slate-500 font-bold">
              {filteredDoctors.length} {filteredDoctors.length === 1 ? 'DOCTOR' : 'DOCTORS'}
            </div>
          </div>

          {/* Mobile & Desktop Responsive Container */}
          <div className="flex-1 overflow-y-auto">
            {filteredDoctors.length === 0 ? (
              /* Wowed Empty State Card */
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-indigo-50 border border-indigo-200 rounded-full flex items-center justify-center mb-4 text-indigo-600">
                  <UserPlus className="w-8 h-8" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight font-mono">
                  No Doctors / Radiologists Registered Yet
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 mb-6">
                  Add consultant radiologist accounts to enable case assignment, digital signatures, and doctor logins.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Doctor</span>
                </button>
              </div>
            ) : (
              <>
                {/* Mobile View: Compact Doctor Cards (< sm) */}
                <div className="sm:hidden p-3 space-y-3">
                  {filteredDoctors.map((doc) => (
                    <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center font-bold text-indigo-600 text-sm font-mono shrink-0">
                            {doc.firstName ? doc.firstName.charAt(0) : 'D'}
                          </div>
                          <div>
                            <div className="font-extrabold text-sm text-slate-900">{doc.fullName}</div>
                            <div className="text-[11px] text-slate-500 font-medium">{doc.degree || 'M.D. (Radiodiagnosis)'}</div>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded font-mono">
                          Active
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
                        <div>EMAIL: <strong>{doc.email}</strong></div>
                        <div>PHONE: <strong>{doc.contactNumber}</strong></div>
                        <div className="text-amber-800 pt-0.5">
                          USER: <strong>{doc.username || doc.email}</strong> | PASS: <strong>{doc.password || 'N/A'}</strong>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteDoctor(doc.id)}
                          className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: Full Spacious Table (>= sm) */}
                <div className="hidden sm:block data-table-container bg-white">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th title="Doctor Name & Qualification" style={{ width: widths.name, position: 'relative' }}>
                          <span>Doctor Name & Qualification</span>
                          <div className="col-resizer" onMouseDown={(e) => startResizing('name', e.clientX, widths.name)} />
                        </th>
                        <th title="Contact Info" style={{ width: widths.contact, position: 'relative' }}>
                          <span>Contact Info</span>
                          <div className="col-resizer" onMouseDown={(e) => startResizing('contact', e.clientX, widths.contact)} />
                        </th>
                        <th title="Login Credentials" style={{ width: widths.credentials, position: 'relative' }}>
                          <span>Login Credentials</span>
                          <div className="col-resizer" onMouseDown={(e) => startResizing('credentials', e.clientX, widths.credentials)} />
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
                      {filteredDoctors.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                          <td title={`${doc.fullName} (${doc.degree || 'M.D.'})`} className="p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center font-bold text-indigo-600 text-sm shrink-0 font-mono">
                                {doc.firstName ? doc.firstName.charAt(0) : 'D'}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{doc.fullName}</div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {doc.degree || 'M.D. (Radiodiagnosis)'} • {doc.registrationNumber || 'MCI Reg. No. 48291'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td title={`${doc.email} | ${doc.contactNumber}`} className="p-3.5">
                            <div className="font-semibold text-slate-800">{doc.email}</div>
                            <div className="font-mono text-[11px] text-slate-500">{doc.contactNumber}</div>
                          </td>
                          <td title={`User: ${doc.username || doc.email} | Pass: ${doc.password || 'N/A'}`} className="p-3.5">
                            <div className="font-mono text-[11px] bg-amber-50 border border-amber-200 px-2.5 py-1 rounded inline-flex gap-3 text-amber-900">
                              <span>USER: <strong>{doc.username || doc.email}</strong></span>
                              <span>PASS: <strong>{doc.password || 'N/A'}</strong></span>
                            </div>
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
                              onClick={() => handleDeleteDoctor(doc.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer rounded hover:bg-rose-50"
                              title="Delete Doctor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

        </div>

      </div>

      <AddDoctorModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddDoctor}
      />
    </div>
  );
}
