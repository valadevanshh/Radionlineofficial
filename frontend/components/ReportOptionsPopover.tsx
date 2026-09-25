'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText, ChevronDown, Printer, Eye, Share2 } from 'lucide-react';
import { XRayReport } from '@/lib/radiology-store';

interface ReportOptionsPopoverProps {
  report: XRayReport;
  onSelectOption: (report: XRayReport, withHeader: boolean, bodyPart?: string) => void;
}

export default function ReportOptionsPopover({ report, onSelectOption }: ReportOptionsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#009ef7] bg-[#009ef7]/10 hover:bg-[#009ef7]/20 border border-[#009ef7]/30 transition-all cursor-pointer"
        title="View X-Ray Report Options"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>Actions</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 shadow-xl z-50 py-1 text-left">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Report Options</p>
            <p className="text-xs font-semibold text-slate-900 truncate">{report.fullName} ({report.patientNumber})</p>
          </div>

          <div className="py-1">
            {report.bodyParts.map((part, idx) => (
              <div key={idx} className="px-2 py-1 border-b border-slate-100 last:border-0">
                <p className="text-[10px] font-bold text-[#009ef7] px-2 py-0.5 uppercase tracking-wide flex items-center justify-between">
                  <span>Report #{idx + 1}: {part}</span>
                  {report.bodyParts.length > 1 && (
                    <span className="text-[9px] text-slate-400 font-mono">Part {idx + 1}/{report.bodyParts.length}</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectOption(report, true, part);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-[#009ef7]/10 hover:text-[#009ef7] transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#009ef7]" />
                  <span className="font-medium">View Report (With Header)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectOption(report, false, part);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium">View Report (Without Header)</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
