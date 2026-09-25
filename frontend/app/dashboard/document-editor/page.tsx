'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RADIOLOGY_TEMPLATES } from '@/lib/radiology-templates';
import { STUDY_MODALITY_OPTIONS } from '@/components/NewXRayReportModal';
import {
  FileText,
  BookmarkPlus,
  Activity,
  Search,
  Check,
  X,
} from 'lucide-react';
import { RadiologyStore, XRayReport, DocTemplate, RadiologyCenter } from '@/lib/radiology-store';
import { ApiClient } from '@/lib/api-client';

export default function DocumentEditorStudioPage() {
  const [reports, setReports] = useState<XRayReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<XRayReport | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<DocTemplate[]>([]);
  const [allCenters, setAllCenters] = useState<RadiologyCenter[]>([]);

  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplCenterId, setTmplCenterId] = useState('ALL');
  const [tmplModality, setTmplModality] = useState('X-Ray');
  const [tmplBodyPart, setTmplBodyPart] = useState('');
  const [tmplFindings, setTmplFindings] = useState('');
  const [tmplImpression, setTmplImpression] = useState('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const router = useRouter();

  const openWorkspace = (report: XRayReport | null) => {
    if (!report) return;
    router.push(`/dashboard/workspace/${report.id}`);
  };

  const loadData = async () => {
    try {
      const [reps, tmpls, cntrs] = await Promise.all([
        ApiClient.getReports(),
        ApiClient.getTemplates(),
        ApiClient.getCenters(),
      ]);
      setReports(reps);
      if (reps.length > 0 && !selectedReport) setSelectedReport(reps[0]);
      setSavedTemplates(tmpls);
      setAllCenters(cntrs.length > 0 ? cntrs : RadiologyStore.getCenters());
    } catch {
      const list = RadiologyStore.getReports();
      setReports(list);
      if (list.length > 0 && !selectedReport) setSelectedReport(list[0]);
      setSavedTemplates(RadiologyStore.getTemplates());
      setAllCenters(RadiologyStore.getCenters());
    }
  };

  useEffect(() => {
    loadData();

    const handleReportsChange = () => loadData();
    const handleTemplatesChange = () => loadData();
    const handleCentersChange = () => loadData();

    window.addEventListener('radionline_reports_changed', handleReportsChange);
    window.addEventListener('radionline_templates_changed', handleTemplatesChange);
    window.addEventListener('radionline_centers_changed', handleCentersChange);
    return () => {
      window.removeEventListener('radionline_reports_changed', handleReportsChange);
      window.removeEventListener('radionline_templates_changed', handleTemplatesChange);
      window.removeEventListener('radionline_centers_changed', handleCentersChange);
    };
  }, []);

  const handleOpenCreateTemplate = () => {
    setTmplTitle(selectedReport ? `${selectedReport.bodyParts.join(', ')} — Master Template` : '');
    setTmplCenterId(selectedReport?.radiologyCenterId || 'ALL');
    setTmplModality('X-Ray');
    setTmplBodyPart('');
    setTmplFindings(
      selectedReport?.findings ||
        'LUNG FIELDS: Both lung fields are clear without focal consolidation, nodule, or mass.\nCARDIOVASCULAR: Cardiac size and silhouette are within normal limits.'
    );
    setTmplImpression(
      selectedReport?.impression ||
        '1. Normal Radiographic Examination.\n2. No active parenchymal or pleural pathology detected.'
    );
    setCreateTemplateOpen(true);
  };

  const handleSaveNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplTitle.trim()) return;

    let centerName = 'All Centers';
    if (tmplCenterId !== 'ALL') {
      const matched = allCenters.find((c) => c.id === tmplCenterId);
      if (matched) centerName = matched.centerName;
    }

    const contentHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <h2 style="color: #009ef7; border-bottom: 2px solid #009ef7; padding-bottom: 4px; text-transform: uppercase;">
          RADIOLOGY REPORT — ${tmplModality}
        </h2>
        <h3 style="color: #0f172a; margin-bottom: 8px;">RADIOLOGICAL FINDINGS:</h3>
        <p>${tmplFindings.replace(/\n/g, '<br/>')}</p>
        <br/>
        <h3 style="color: #0f172a; margin-bottom: 8px;">IMPRESSION & CONCLUSION:</h3>
        <div style="background-color: #f1f5f9; padding: 10px; border-left: 4px solid #009ef7;">
          <p>${tmplImpression.replace(/\n/g, '<br/>')}</p>
        </div>
      </div>
    `;

    const tmplObj = {
      title: tmplTitle.trim(),
      centerId: tmplCenterId,
      centerName,
      modality: tmplModality,
      bodyPart: tmplBodyPart.trim() || tmplModality,
      findings: tmplFindings,
      impression: tmplImpression,
      content: contentHtml,
    };

    try {
      await ApiClient.saveTemplate(tmplObj);
    } catch (err) {
      console.warn('API save template error:', err);
    }

    RadiologyStore.saveTemplate(tmplObj);
    loadData();

    setCreateTemplateOpen(false);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3500);
  };


  const filteredReports = reports.filter(
    (r) =>
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.patientNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.bodyParts.some((bp) => bp.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Section Header */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="section-title">RADIOLOGY DOCUMENT & TEMPLATE STUDIO</span>
          <span className="tag" style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
            EDITOR
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleOpenCreateTemplate}
            className="btn btn-secondary btn-sm"
          >
            <BookmarkPlus size={13} />
            <span>Save Template</span>
          </button>

          <button
            type="button"
            onClick={() => openWorkspace(selectedReport)}
            className="btn btn-secondary btn-sm"
          >
            <Activity size={13} />
            <span>PACS Viewer</span>
          </button>

          <button
            type="button"
            onClick={() => openWorkspace(selectedReport)}
            className="btn btn-teal btn-sm"
          >
            <FileText size={13} />
            <span>Open Studio</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body (Zero Outer Scroll) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }} className="flex-col md:flex-row">
        
        {/* Left Side: Patient Selector Sidebar */}
        <div
          style={{
            width: '100%',
            maxWidth: 320,
            borderRight: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
          className="w-full md:w-80"
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search patient, PAT-ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: 26, fontSize: 11 }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredReports.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedReport(r)}
                style={{
                  padding: 8,
                  borderRadius: 5,
                  border: selectedReport?.id === r.id ? '1px solid var(--navy)' : '1px solid var(--border)',
                  background: selectedReport?.id === r.id ? 'var(--navy-light)' : 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)' }}>
                    {r.patientNumber}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.studyDate}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{r.fullName}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.bodyParts.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Active Workspace & Templates */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 12, gap: 12 }}>
          {saveSuccessNotice && (
            <div className="alert alert-success">
              <Check size={16} />
              <span>New template created successfully! It is now available in your template library.</span>
            </div>
          )}

          {selectedReport ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <div>
                  <span className="tag" style={{ background: 'var(--navy)', color: '#fff', marginRight: 6 }}>
                    {selectedReport.patientNumber}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    {selectedReport.fullName}
                  </span>
                </div>
                <span className="tag" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>
                  {selectedReport.status}
                </span>
              </div>

              <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                <div>AGE/SEX: {selectedReport.age}/{selectedReport.gender}</div>
                <div>CENTER: {selectedReport.radiologyCenterName}</div>
                <div>DOCTOR: {selectedReport.assignedDoctorName}</div>
              </div>

              <div style={{ display: 'flex', gap: 6, paddingTop: 6 }}>
                <button
                  type="button"
                  onClick={() => openWorkspace(selectedReport)}
                  className="btn btn-primary btn-sm"
                >
                  <FileText size={13} />
                  <span>Edit in DOC Studio</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCreateTemplate}
                  className="btn btn-secondary btn-sm"
                >
                  <BookmarkPlus size={13} />
                  <span>Save New Template</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a patient report from the list to start editing.
            </div>
          )}

          {/* Saved Templates List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SAVED RADIOLOGY REPORT TEMPLATES ({savedTemplates.length})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {savedTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => openWorkspace(selectedReport)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="tag" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                      {tmpl.modality}
                    </span>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{tmpl.centerName}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{tmpl.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600, marginTop: 4 }}>
                    Use Template →
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save Template Modal */}
      {createTemplateOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="section-title">Save Master Template</span>
              <button type="button" onClick={() => setCreateTemplateOpen(false)} className="btn btn-ghost btn-sm">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleSaveNewTemplate} className="modal-body">
              <div className="form-row">
                <label className="form-label">Template Name *</label>
                <input
                  type="text"
                  required
                  value={tmplTitle}
                  onChange={(e) => setTmplTitle(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="form-row">
                <label className="form-label">Target Center *</label>
                <select
                  value={tmplCenterId}
                  onChange={(e) => setTmplCenterId(e.target.value)}
                  className="form-control"
                >
                  <option value="ALL">All Centers (Global Template)</option>
                  {allCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.centerName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Modality *</label>
                <select
                  value={tmplModality}
                  onChange={(e) => setTmplModality(e.target.value)}
                  className="form-control"
                >
                  {STUDY_MODALITY_OPTIONS.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
              <div className="form-row">
                <label className="form-label">Body Part <span className="text-rose-500">*</span></label>
                <input
                  required
                  type="text"
                  value={tmplBodyPart}
                  onChange={(e) => setTmplBodyPart(e.target.value)}
                  className="form-control"
                  placeholder="Must match case body part exactly (e.g. CHEST PA/AP)"
                />
              </div>

                <label className="form-label">Findings Content</label>
                <textarea
                  rows={4}
                  value={tmplFindings}
                  onChange={(e) => setTmplFindings(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="form-row">
                <label className="form-label">Impression & Conclusion</label>
                <textarea
                  rows={3}
                  value={tmplImpression}
                  onChange={(e) => setTmplImpression(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="modal-footer" style={{ padding: '10px 0 0 0' }}>
                <button type="button" onClick={() => setCreateTemplateOpen(false)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" className="btn btn-teal btn-sm">
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

</div>
  );
}
