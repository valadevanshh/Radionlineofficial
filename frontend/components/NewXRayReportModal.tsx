'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, FilePlus, Check, Trash2, Upload, AlertTriangle, ChevronDown, User, Stethoscope, FileText } from 'lucide-react';
import { RadiologyStore, XRayReport, Doctor, RadiologyCenter } from '@/lib/radiology-store';
import { ApiClient } from '@/lib/api-client';

interface NewXRayReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (report: Omit<XRayReport, 'id' | 'createdAt'>) => void;
}

export const STUDY_MODALITY_OPTIONS = [
  'X-Ray',
  'CT',
  'MRI',
  'Sonography',
  'Blood Report',
] as const;

const BODY_PART_OPTIONS = [
  'CHEST PA/AP',
  'KNEE JOINT AP/LAT',
  'LUMBAR SPINE AP/LAT',
  'CERVICAL SPINE AP/LAT',
  'PELVIS WITH BOTH HIPS',
  'SKULL AP/LAT',
  'SHOULDER JOINT AP',
  'ABDOMEN ERECT/SUPINE',
  'FOOT AP/OBLIQUE',
  'HAND AP/OBLIQUE',
];

export default function NewXRayReportModal({ isOpen, onClose, onSave }: NewXRayReportModalProps) {
  const [fullName, setFullName] = useState('');
  const [ageValue, setAgeValue] = useState<number | ''>(30);
  const [ageUnit, setAgeUnit] = useState<'Years' | 'Months' | 'Days'>('Years');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [patientNumber, setPatientNumber] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [modality, setModality] = useState<string>('X-Ray');
  const [assignedDoctorId, setAssignedDoctorId] = useState('');
  const [referringPhysicianName, setReferringPhysicianName] = useState('');
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [customBodyPart, setCustomBodyPart] = useState('');
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [isPortable, setIsPortable] = useState<boolean>(false);

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formBodyRef = useRef<HTMLFormElement | null>(null);

  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(['ALL']);
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState<boolean>(false);

  const [centers, setCenters] = useState<RadiologyCenter[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    if (isOpen) {
      const loadOptions = async () => {
        try {
          const [cList, dList] = await Promise.all([
            ApiClient.getCenters(),
            ApiClient.getDoctors(),
          ]);
          setCenters(cList.length > 0 ? cList : RadiologyStore.getCenters());
          setDoctors(dList.length > 0 ? dList : RadiologyStore.getDoctors());
          if (cList.length > 0) setSelectedCenterId(cList[0].id);
        } catch {
          const storedCenters = RadiologyStore.getCenters();
          const storedDoctors = RadiologyStore.getDoctors();
          setCenters(storedCenters);
          setDoctors(storedDoctors);
          if (storedCenters.length > 0) setSelectedCenterId(storedCenters[0].id);
        }
      };

      loadOptions();

      setFullName('');
      setAgeValue(30);
      setAgeUnit('Years');
      setGender('Male');
      setReferringPhysicianName('');
      setClinicalHistory('');
      setSelectedBodyParts([]);
      setModality('X-Ray');
      setSelectedDoctorIds(['ALL']);
      setIsUrgent(false);
      setIsPortable(false);
      setPatientNumber(`PAT-${Math.floor(1000 + Math.random() * 9000)}`);
      setUploadedImages([]);
      setIsSubmitting(false);
      setIsDoctorDropdownOpen(false);
      setFormError(null);
    }
  }, [isOpen]);

  const handleDecrementAge = () => {
    setAgeValue((prev) => {
      if (typeof prev !== 'number' || prev <= 1) return 1;
      return prev - 1;
    });
  };

  const handleIncrementAge = () => {
    setAgeValue((prev) => {
      if (typeof prev !== 'number') return 1;
      return prev + 1;
    });
  };

  const handleToggleDoctorSelect = (docId: string) => {
    if (docId === 'ALL') {
      setSelectedDoctorIds(['ALL']);
      return;
    }

    let updated = selectedDoctorIds.filter((id) => id !== 'ALL');
    if (updated.includes(docId)) {
      updated = updated.filter((id) => id !== docId);
    } else {
      updated.push(docId);
    }

    if (updated.length === 0) {
      updated = ['ALL'];
    }
    setSelectedDoctorIds(updated);
  };

  if (!isOpen) return null;

  const handleToggleBodyPart = (part: string) => {
    if (selectedBodyParts.includes(part)) {
      setSelectedBodyParts(selectedBodyParts.filter((p) => p !== part));
    } else {
      setSelectedBodyParts([...selectedBodyParts, part]);
    }
  };

  const handleAddCustomBodyPart = () => {
    if (customBodyPart.trim() && !selectedBodyParts.includes(customBodyPart.toUpperCase())) {
      setSelectedBodyParts([...selectedBodyParts, customBodyPart.trim().toUpperCase()]);
      setCustomBodyPart('');
    }
  };

  const compressImageFile = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!file.type.startsWith('image/')) {
          resolve(dataUrl);
          return;
        }
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
          } else {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleProcessFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;
    setIsUploading(true);
    setFormError(null);

    try {
      const processedPromises = fileList.map((file) => {
        if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.dcm') && !file.type.endsWith('pdf')) {
          setFormError(`File "${file.name}" format not supported.`);
          return Promise.resolve('');
        }
        return compressImageFile(file);
      });

      const results = await Promise.all(processedPromises);
      const validImages = results.filter((img) => img.length > 0);
      setUploadedImages((prev) => [...prev, ...validImages]);
    } catch (err) {
      console.error('File compression error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      formBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      setFormError('Please enter Patient Full Name.');
      document.getElementById('patient-fullname-input')?.focus();
      return;
    }

    if (!selectedCenterId) {
      formBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      setFormError('Please select a Radiology Lab.');
      return;
    }

    if (!modality) {
      setFormError('Please select a modality (X-Ray, CT, MRI, Sonography, or Blood Report).');
      return;
    }

    if (selectedBodyParts.length === 0) {
      setFormError('Please select at least one study / body part.');
      return;
    }

    setIsSubmitting(true);

    try {
      const center = centers.find((c) => c.id === selectedCenterId);
      const doctor = doctors.find((d) => d.id === assignedDoctorId);

      const reportsByBodyPart: Record<string, string> = {};
      const impressionsByBodyPart: Record<string, string> = {};

      selectedBodyParts.forEach((bp) => {
        if (bp.includes('CHEST')) {
          reportsByBodyPart[bp] =
            'LUNG FIELDS ARE CLEAR. NORMAL CARDIAC SIZE AND SHAPE. COSTOPHRENIC ANGLES ARE CLEAR.';
          impressionsByBodyPart[bp] = 'NORMAL CHEST X-RAY STUDY.';
        } else if (bp.includes('KNEE')) {
          reportsByBodyPart[bp] =
            'JOINT SPACE IS MILDLY REDUCED IN MEDIAL COMPARTMENT. SUBCONDRAL SCLEROSIS NOTED.';
          impressionsByBodyPart[bp] = 'EARLY OSTEOARTHRITIC CHANGES IN KNEE JOINT.';
        } else if (bp.includes('LUMBAR')) {
          reportsByBodyPart[bp] =
            'MILD REDUCTION OF L4-L5 INTERVERTEBRAL DISC SPACE. NO BONY LESION DETECTED.';
          impressionsByBodyPart[bp] = 'LUMBAR SPONDYLOSIS WITH DISC SPACE NARROWING.';
        } else {
          reportsByBodyPart[bp] = 'BONY ARCHITECTURE AND ALIGNMENT APPEAR NORMAL.';
          impressionsByBodyPart[bp] = 'NO RECENT BONY INJURY DISCOVERED.';
        }
      });

      const now = new Date();
      const formattedDate = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${now.getFullYear()}`;

      const isAll = selectedDoctorIds.includes('ALL');
      const docNames = doctors
        .filter((d) => selectedDoctorIds.includes(d.id))
        .map((d) => d.fullName);

      const assignedId = isAll ? 'ALL' : selectedDoctorIds[0] || 'ALL';
      const assignedName = isAll
        ? 'ALL DOCTORS (Broadcast)'
        : docNames.join(', ') || 'ALL DOCTORS';

      const combinedFindings = selectedBodyParts.map((bp) => `[ ${bp} ]\n${reportsByBodyPart[bp]}`).join('\n\n');
      const combinedImpression = selectedBodyParts.map((bp) => `[ ${bp} ]\n${impressionsByBodyPart[bp]}`).join('\n\n');

      await onSave({
        fullName: fullName.trim().toUpperCase(),
        patientNumber,
        gender,
        age: Number(ageValue),
        ageUnit,
        phone: '+91 98250 11223',
        radiologyCenterId: selectedCenterId,
        radiologyCenterName: center ? center.centerName : 'RADIOLOGY CENTER',
        referringPhysicianId: 'ref-doc-1',
        referringPhysicianName: referringPhysicianName.toUpperCase(),
        assignedDoctorId: assignedId,
        assignedDoctorName: assignedName,
        assignedDoctorIds: selectedDoctorIds,
        claimStatus: 'UNCLAIMED',
        clinicalNotes: clinicalHistory,
        bodyParts: selectedBodyParts,
        modality,
        findings: combinedFindings,
        impression: combinedImpression,
        reportsByBodyPart,
        impressionsByBodyPart,
        status: 'Pending',
        isUrgent,
        isPortable,
        studyDate: formattedDate,
        dicomSnapshots: uploadedImages,
        uploadedImages: uploadedImages,
      });

      onClose();
    } catch (err: any) {
      console.error('Error creating patient record:', err);
      setFormError(`Error creating patient record: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-md p-0 sm:p-4 overflow-y-auto">
      <div className="relative bg-white text-slate-900 w-full max-w-xl lg:max-w-4xl rounded-t-2xl sm:rounded-3xl shadow-2xl my-0 sm:my-auto flex flex-col max-h-[92vh] sm:max-h-[90vh] border border-slate-100 overflow-hidden font-sans transition-all">
        {/* Modern Header Bar */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#009ef7]/10 flex items-center justify-center text-[#009ef7] shrink-0">
              <FilePlus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Add Patient Record
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Responsive Form Body */}
        <form id="new-xray-report-form" ref={formBodyRef} noValidate onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* 2-Column Grid Layout for Desktop (>=1024px) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Left Column: Patient Info & Diagnostics */}
            <div className="space-y-4">
              {/* Patient Details */}
              <div className="space-y-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Patient Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Full Name *</label>
                    <input
                      id="patient-fullname-input"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. JOHN DOE"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs font-semibold uppercase transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Reg No / ID</label>
                    <input
                      type="text"
                      value={patientNumber}
                      onChange={(e) => setPatientNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono text-xs font-bold transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gender *</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs font-medium transition-all"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Age *</label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center border border-slate-200 bg-white rounded-xl overflow-hidden focus-within:border-[#009ef7] focus-within:ring-2 focus-within:ring-[#009ef7]/10 transition-all flex-1">
                        <button
                          type="button"
                          onClick={handleDecrementAge}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer border-r border-slate-200 active:scale-95 transition-all select-none"
                          title="Decrease age"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          required
                          min={0}
                          max={150}
                          value={ageValue}
                          placeholder="30"
                          onChange={(e) => setAgeValue(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full text-center py-2 bg-transparent text-slate-900 focus:outline-none text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={handleIncrementAge}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer border-l border-slate-200 active:scale-95 transition-all select-none"
                          title="Increase age"
                        >
                          +
                        </button>
                      </div>

                      <select
                        value={ageUnit}
                        onChange={(e) => setAgeUnit(e.target.value as 'Years' | 'Months' | 'Days')}
                        className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs font-medium transition-all"
                      >
                        <option value="Years">Years</option>
                        <option value="Months">Months</option>
                        <option value="Days">Days</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnostic & Doctor Assignment */}
              <div className="space-y-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Assignment & Modality</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Radiology Lab *</label>
                    <select
                      value={selectedCenterId}
                      onChange={(e) => setSelectedCenterId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs font-medium transition-all"
                    >
                      {centers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.centerName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Assign Radiologist *
                    </label>
                    
                    <button
                      type="button"
                      onClick={() => setIsDoctorDropdownOpen(!isDoctorDropdownOpen)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-left focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs font-semibold flex items-center justify-between cursor-pointer transition-all"
                    >
                      <span className="truncate">
                        {selectedDoctorIds.includes('ALL')
                          ? 'ALL DOCTORS (Broadcast)'
                          : `${selectedDoctorIds.length} Radiologist(s)`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                    </button>

                    {isDoctorDropdownOpen && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl p-2 space-y-1 text-xs max-h-48 overflow-y-auto rounded-xl">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-[#009ef7] p-1.5 hover:bg-[#009ef7]/5 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedDoctorIds.includes('ALL')}
                            onChange={() => handleToggleDoctorSelect('ALL')}
                            className="w-4 h-4 rounded border-slate-300 text-[#009ef7] focus:ring-0"
                          />
                          <span>ALL DOCTORS (Broadcast)</span>
                        </label>

                        {doctors.map((d) => {
                          const isChecked = selectedDoctorIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg font-medium text-slate-700 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleDoctorSelect(d.id)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-[#009ef7] focus:ring-0"
                              />
                              <span>{d.fullName}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Modality *</label>
                    <select
                      value={modality}
                      onChange={(e) => setModality(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#009ef7]/30"
                    >
                      {STUDY_MODALITY_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Referring Physician
                    </label>
                    <input
                      type="text"
                      value={referringPhysicianName}
                      onChange={(e) => setReferringPhysicianName(e.target.value)}
                      placeholder="e.g. DR. ROBERT SMITH"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs uppercase font-medium transition-all"
                    />
                  </div>
                </div>

                {/* Priority Flags */}
                <div className="flex flex-wrap items-center gap-5 py-2 px-3 bg-white rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={(e) => setIsUrgent(e.target.checked)}
                      className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-0 cursor-pointer"
                    />
                    <span className={`text-xs font-semibold ${isUrgent ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>
                      Urgent (STAT)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPortable}
                      onChange={(e) => setIsPortable(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-0 cursor-pointer"
                    />
                    <span className={`text-xs font-semibold ${isPortable ? 'text-amber-800 font-bold' : 'text-slate-700'}`}>
                      Portable
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Body Parts, Clinical History & Attachments */}
            <div className="space-y-4">
              {/* Select Body Parts / X-Ray Studies */}
              <div className="space-y-2 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Select Study / Body Part *</h4>

                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {BODY_PART_OPTIONS.map((part) => {
                    const isSelected = selectedBodyParts.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleBodyPart(part)}
                        className={`px-2.5 sm:px-3 py-1 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#009ef7] border-[#009ef7] text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {part}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customBodyPart}
                    onChange={(e) => setCustomBodyPart(e.target.value)}
                    placeholder="Custom study name..."
                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs uppercase focus:border-[#009ef7] focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomBodyPart}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer transition-all shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Clinical History & Uploads */}
              <div className="space-y-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">History & Attachments</h4>
                
                <div className="flex flex-col">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Clinical History</label>
                  <textarea
                    rows={2}
                    value={clinicalHistory}
                    onChange={(e) => setClinicalHistory(e.target.value)}
                    placeholder="Enter patient symptoms or clinical notes..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-[#009ef7] focus:ring-2 focus:ring-[#009ef7]/10 focus:outline-none text-xs resize-none transition-all"
                  />
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      <Upload className="w-3 h-3 text-[#009ef7]" />
                      <span>Upload Files</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files) {
                        handleProcessFiles(e.dataTransfer.files);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-3 text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[70px] ${
                      isDragging
                        ? 'border-[#009ef7] bg-[#009ef7]/5'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.dcm,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleProcessFiles(e.target.files);
                        }
                      }}
                    />
                    <Upload className="w-4 h-4 text-[#009ef7]" />
                    <p className="font-semibold text-slate-700 text-[11px]">
                      Drop files or <span className="text-[#009ef7] underline">Browse</span>
                    </p>
                  </div>

                  {isUploading && (
                    <p className="text-[10px] text-[#009ef7] font-semibold mt-1 animate-pulse">
                      Uploading files...
                    </p>
                  )}

                  {uploadedImages.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
                      {uploadedImages.map((imgSrc, idx) => (
                        <div key={idx} className="relative group shrink-0 w-9 h-9 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                          {imgSrc.startsWith('data:image/') ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={imgSrc}
                              alt={`File ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileText className="w-4 h-4 text-[#009ef7]" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(idx);
                            }}
                            className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                          >
                            <Trash2 className="w-3 h-3 text-rose-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Pinned Sticky Footer (Always Reachable at 1440x900) */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 sm:px-6 py-3.5 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3 shrink-0 z-10 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-xray-report-form"
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-white bg-[#009ef7] hover:bg-[#0095e8] active:scale-98 disabled:opacity-60 transition-all cursor-pointer shadow-md shadow-[#009ef7]/20"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Create Patient Record</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

