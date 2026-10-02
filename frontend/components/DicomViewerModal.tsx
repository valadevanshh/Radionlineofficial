'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Sun,
  Moon,
  Maximize2,
  Ruler,
  Sliders,
  Layers,
  Camera,
  Info,
  Check,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Activity,
  Menu,
  FolderOpen,
  FileText,
  MousePointer,
  Search,
  Grid,
  Circle,
  Square,
  ArrowUpRight,
  Type,
  LayoutGrid,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  List,
  ListOrdered,
  Undo,
  Redo,
  FileCheck,
  Printer,
  Sparkles,
  ChevronDown,
  Download,
  Wand2,
  GripVertical,
  FlipHorizontal,
  FlipVertical,
  Trash2,
  BookmarkPlus,
  AlertTriangle,
  CheckCircle2,
  MoreVertical,
  MessageSquare,
  ChevronUp,
} from 'lucide-react';
import { XRayReport, RadiologyStore, DocTemplate, RadiologyCenter } from '@/lib/radiology-store';
import { AUTOCOMPLETE_SUGGESTIONS } from '@/lib/radiology-autocomplete';
import SpellCheckTextarea from '@/components/SpellCheckTextarea';
import { STUDY_MODALITY_OPTIONS } from '@/components/NewXRayReportModal';
import { printReportElement, type PrintReportPayload } from '@/lib/print-helper';
import { ApiClient } from '@/lib/api-client';

interface DicomViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  report?: XRayReport | null;
  onSaveSnapshot?: (snapshotUrl: string) => void;
  onSaveReport?: (updatedReport: XRayReport) => void;
  onOpenActivity?: () => void;
}

const generateDicomSvg = (bodyPart: string, modality: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" style="background:%2305070a;"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23475569"/><stop offset="50%" stop-color="%231e293b"/><stop offset="100%" stop-color="%23020617"/></radialGradient></defs><rect width="1000" height="1000" fill="url(%23g)"/><path d="M 300 250 Q 500 150 700 250 T 700 750 Q 500 850 300 750 Z" fill="none" stroke="%2394a3b8" stroke-width="4" stroke-dasharray="8 4" opacity="0.6"/><path d="M 380 320 C 440 380 440 620 380 680" fill="none" stroke="%23f8fafc" stroke-width="12" opacity="0.85"/><path d="M 620 320 C 560 380 560 620 620 680" fill="none" stroke="%23f8fafc" stroke-width="12" opacity="0.85"/><ellipse cx="500" cy="500" rx="140" ry="220" fill="none" stroke="%23cbd5e1" stroke-width="6" opacity="0.75"/><text x="40" y="60" fill="%23009ef7" font-family="monospace" font-size="24" font-weight="bold">RADIONET DICOM WORKSTATION</text><text x="40" y="95" fill="%2394a3b8" font-family="monospace" font-size="18">${encodeURIComponent(modality)} — ${encodeURIComponent(bodyPart)}</text><text x="920" y="70" fill="%23f8fafc" font-family="sans-serif" font-size="42" font-weight="bold">R</text><line x1="40" y1="940" x2="240" y2="940" stroke="%23009ef7" stroke-width="4"/><text x="40" y="970" fill="%23009ef7" font-family="monospace" font-size="16">SCALE: 10 cm</text></svg>`;

export const SAMPLE_DICOM_SERIES = [
  {
    id: 'chest-pa-1',
    title: 'HIP & PELVIS AP/LAT PORTABLE',
    modality: 'DX (Digital Radiography)',
    bodyPart: 'HIP & PELVIS AP/LAT',
    studyDate: '08 Sep 2026 19:47',
    seriesDescription: 'PBH AP & RT HIP AP/LAT PORTABLE',
    kvp: '80 kVp',
    ma: '200 mA',
    exposureTime: '32 ms',
    pixelSpacing: '0.14 mm / px',
    rowsCols: '2048 x 2048',
    institution: 'DIAGNOSTICS PACS HUB',
    imageUrl: generateDicomSvg('HIP & PELVIS', 'DX'),
    ww: 1500,
    wl: -600,
  },
  {
    id: 'knee-ap-1',
    title: 'KNEE JOINT WEIGHT BEARING AP/LAT (DX)',
    modality: 'DX (Digital Radiography)',
    bodyPart: 'KNEE JOINT',
    studyDate: '08 Sep 2026 18:30',
    seriesDescription: 'Knee Joint Bilateral AP',
    kvp: '70 kVp',
    ma: '160 mA',
    exposureTime: '40 ms',
    pixelSpacing: '0.10 mm / px',
    rowsCols: '1920 x 1920',
    institution: 'ADVANCE PORTABLE X-RAY',
    imageUrl: generateDicomSvg('KNEE JOINT', 'DX'),
    ww: 2000,
    wl: 400,
  },
  {
    id: 'spine-lumbar-1',
    title: 'LUMBAR SPINE FLEXION/EXTENSION (DX)',
    modality: 'DX (Digital Radiography)',
    bodyPart: 'LUMBAR SPINE',
    studyDate: '08 Sep 2026 16:15',
    seriesDescription: 'L-Spine Neutral & Lateral',
    kvp: '85 kVp',
    ma: '250 mA',
    exposureTime: '80 ms',
    pixelSpacing: '0.12 mm / px',
    rowsCols: '2048 x 2500',
    institution: 'DIAGNOSTICS RESEARCH',
    imageUrl: generateDicomSvg('LUMBAR SPINE', 'DX'),
    ww: 1800,
    wl: 350,
  },
  {
    id: 'brain-ct-slice-1',
    title: 'BRAIN AXIAL NON-CONTRAST CT STACK (CT)',
    modality: 'CT (Computed Tomography)',
    bodyPart: 'BRAIN / HEAD',
    studyDate: '08 Sep 2026 14:00',
    seriesDescription: 'Axial 5mm Thin Slices',
    kvp: '120 kVp',
    ma: '200 mA',
    exposureTime: '500 ms',
    pixelSpacing: '0.48 mm / px',
    rowsCols: '512 x 512',
    institution: 'PACS HUB',
    imageUrl: generateDicomSvg('BRAIN / HEAD', 'CT'),
    ww: 80,
    wl: 40,
  },
];

import { RADIOLOGY_TEMPLATES, SystemReportTemplate as ReportTemplate } from '@/lib/radiology-templates';
export type { ReportTemplate };
export { RADIOLOGY_TEMPLATES };

export type ToolMode =
  | 'none'
  | 'pan'
  | 'zoom'
  | 'stack'
  | 'pointer'
  | 'magnifier'
  | 'wwwl'
  | 'measure'
  | 'angle'
  | 'cobb'
  | 'roi_ellipse';

export type GridLayout = '1x1' | '1x2' | '2x1' | '2x2';

interface AnnotationLine {
  id: string;
  type: 'measure' | 'angle' | 'cobb' | 'ellipse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
  x4?: number;
  y4?: number;
  label?: string;
}

export default function DicomViewerModal({
  isOpen,
  onClose,
  report,
  onSaveSnapshot,
  onSaveReport,
  onOpenActivity,
}: DicomViewerModalProps) {
  const [isReportingOpen, setIsReportingOpen] = useState(true);
  const [withHeader, setWithHeader] = useState(true);
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1');
  const [activeViewportIdx, setActiveViewportIdx] = useState(0);
  const [mobileActiveView, setMobileActiveView] = useState<'dicom' | 'report'>('dicom');
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isLgLayout, setIsLgLayout] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [toolsMoreOpen, setToolsMoreOpen] = useState(false);
  const toolsMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [storedTemplates, setStoredTemplates] = useState<DocTemplate[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Save Template Modal State
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [saveTmplTitle, setSaveTmplTitle] = useState('');
  const [saveTmplCenterId, setSaveTmplCenterId] = useState('ALL');
  const [saveTmplModality, setSaveTmplModality] = useState('X-Ray');
  const [saveTemplateSuccess, setSaveTemplateSuccess] = useState(false);
  const [allCenters, setAllCenters] = useState<RadiologyCenter[]>([]);

  // Report Formatting State
  const [reportFontFamily, setReportFontFamily] = useState<'font-serif' | 'font-sans' | 'font-mono'>('font-serif');
  const [reportFontSize, setReportFontSize] = useState<'text-xs' | 'text-sm' | 'text-base'>('text-sm');
  const [reportTextAlign, setReportTextAlign] = useState<'text-left' | 'text-center' | 'text-right'>('text-left');
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const [isUnderlineActive, setIsUnderlineActive] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTool, setActiveTool] = useState<ToolMode>('pan');

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsLgLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!moreMenuOpen && !toolsMoreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
      if (toolsMoreRef.current && !toolsMoreRef.current.contains(e.target as Node)) {
        setToolsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreMenuOpen, toolsMoreOpen]);

  useEffect(() => {
    if (isOpen) {
      setStoredTemplates(RadiologyStore.getTemplates());
      setAllCenters(RadiologyStore.getCenters());
      (async () => {
        try {
          const [tmpls, cntrs] = await Promise.all([
            ApiClient.getTemplates(),
            ApiClient.getCenters(),
          ]);
          if (tmpls?.length) {
            // Merge API templates with local/system templates so built-ins stay available
            const byId = new Map<string, DocTemplate>();
            RadiologyStore.getTemplates().forEach((t) => byId.set(t.id, t));
            tmpls.forEach((t) => {
              byId.set(t.id, t);
              RadiologyStore.saveTemplate(t);
            });
            setStoredTemplates(Array.from(byId.values()));
          }
          if (cntrs?.length) setAllCenters(cntrs);
        } catch (err) {
          console.warn('Failed to load templates/centers from API:', err);
        }
      })();
    }

    const handleTemplatesChange = () => setStoredTemplates(RadiologyStore.getTemplates());
    const handleCentersChange = () => setAllCenters(RadiologyStore.getCenters());
    window.addEventListener('radionline_templates_changed', handleTemplatesChange);
    window.addEventListener('radionline_centers_changed', handleCentersChange);
    return () => {
      window.removeEventListener('radionline_templates_changed', handleTemplatesChange);
      window.removeEventListener('radionline_centers_changed', handleCentersChange);
    };
  }, [isOpen]);

  // Report Text & Content State
  const [reportTitle, setReportTitle] = useState(
    report?.bodyParts?.length ? `X-RAY ${report.bodyParts.join(' & ').toUpperCase()} EXAMINATION` : 'X-RAY EXAMINATION'
  );
  const [findingText, setFindingText] = useState(
    report?.findings || (report?.reportsByBodyPart && Object.values(report.reportsByBodyPart).join('\n\n')) || ''
  );
  const [impressionText, setImpressionText] = useState(
    report?.impression || (report?.impressionsByBodyPart && Object.values(report.impressionsByBodyPart).join('\n\n')) || ''
  );


  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const caseModality = norm(report?.modality);
  const caseBodyParts = (report?.bodyParts || []).map((bp) => norm(bp)).filter(Boolean);
  const templateMatchesCase = (tmpl: DocTemplate) => {
    const tMod = norm(tmpl.modality);
    const tBp = norm(tmpl.bodyPart);
    // "X-Ray" should match "X-Ray Chest", "CT" match "CT Scan", etc.
    const modalityOk =
      !caseModality ||
      !tMod ||
      tMod === caseModality ||
      tMod.startsWith(caseModality) ||
      caseModality.startsWith(tMod) ||
      tMod.includes(caseModality) ||
      caseModality.includes(tMod.split(/\s+/)[0] || tMod);
    const bodyOk =
      caseBodyParts.length === 0 ||
      !tBp ||
      caseBodyParts.some((bp) => bp === tBp || bp.includes(tBp) || tBp.includes(bp));
    return modalityOk && bodyOk;
  };
  const filteredTemplates = showAllTemplates
    ? storedTemplates
    : storedTemplates.filter(templateMatchesCase);

  const handleOpenSaveTemplate = () => {
    setSaveTmplTitle(reportTitle || (report?.bodyParts?.join(', ') ? `${report.bodyParts.join(', ')} — Custom Template` : 'New Custom Radiology Template'));
    setSaveTmplCenterId(report?.radiologyCenterId || 'ALL');
    setSaveTmplModality(report?.modality || 'X-Ray');
    setSaveTemplateModalOpen(true);
  };

  const handleConfirmSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTmplTitle.trim()) return;

    let centerName = 'All Centers';
    if (saveTmplCenterId !== 'ALL') {
      const matched = allCenters.find((c) => c.id === saveTmplCenterId);
      if (matched) centerName = matched.centerName;
    }

    const contentHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <h2 style="color: #009ef7; border-bottom: 2px solid #009ef7; padding-bottom: 4px; text-transform: uppercase;">
          ${reportTitle || saveTmplTitle}
        </h2>
        <h3 style="color: #0f172a; margin-bottom: 8px;">RADIOLOGICAL FINDINGS:</h3>
        <p>${findingText.replace(/\n/g, '<br/>')}</p>
        <br/>
        <h3 style="color: #0f172a; margin-bottom: 8px;">IMPRESSION & CONCLUSION:</h3>
        <div style="background-color: #f1f5f9; padding: 10px; border-left: 4px solid #009ef7;">
          <p>${impressionText.replace(/\n/g, '<br/>')}</p>
        </div>
      </div>
    `;

    const tmplPayload = {
      title: saveTmplTitle.trim(),
      centerId: saveTmplCenterId,
      centerName,
      modality: report?.modality || saveTmplModality,
      bodyPart: report?.bodyParts?.[0] || saveTmplModality,
      findings: findingText,
      impression: impressionText,
      content: contentHtml,
    };
    RadiologyStore.saveTemplate(tmplPayload);
    ApiClient.saveTemplate(tmplPayload).catch((err) => {
      console.warn('ApiClient save template error:', err);
    });

    setSaveTemplateModalOpen(false);
    setSaveTemplateSuccess(true);
    setTimeout(() => setSaveTemplateSuccess(false), 3000);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportSavedSuccess, setReportSavedSuccess] = useState(false);

  const [activeBodyPartIdx, setActiveBodyPartIdx] = useState<number>(0);
  const [techniqueByPart, setTechniqueByPart] = useState<Record<string, string>>({});
  const [techniqueText, setTechniqueText] = useState('');
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [leaveGuardAction, setLeaveGuardAction] = useState<null | (() => void)>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [studyStatuses, setStudyStatuses] = useState<Record<string, string>>({});

  const [bodyPartReports, setBodyPartReports] = useState<Record<string, string>>({});
  const [bodyPartImpressions, setBodyPartImpressions] = useState<Record<string, string>>({});

  const handleSwitchBodyPartTab = (newIdx: number) => {
    if (!report?.bodyParts || newIdx < 0 || newIdx >= report.bodyParts.length) return;
    const currentPart = report.bodyParts[activeBodyPartIdx] || 'GENERAL';
    const updatedRMap = { ...bodyPartReports, [currentPart]: findingText };
    const updatedIMap = { ...bodyPartImpressions, [currentPart]: impressionText };
    setBodyPartReports(updatedRMap);
    setBodyPartImpressions(updatedIMap);

    setActiveBodyPartIdx(newIdx);
    const newPart = report.bodyParts[newIdx];
    setFindingText(updatedRMap[newPart] || '');
    setImpressionText(updatedIMap[newPart] || '');
    setReportTitle(`X-RAY ${newPart.toUpperCase()} EXAMINATION`);
  };

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const initFromReport = async () => {
      if (!report) {
        setReportTitle('X-RAY EXAMINATION');
        setFindingText('');
        setImpressionText('');
        setBodyPartReports({});
        setBodyPartImpressions({});
        setActiveBodyPartIdx(0);
        setSelectedTemplateId('');
        return;
      }

      const parts = report.bodyParts && report.bodyParts.length > 0 ? report.bodyParts : ['GENERAL'];
      const rMap: Record<string, string> = { ...(report.reportsByBodyPart || {}) };
      const iMap: Record<string, string> = { ...(report.impressionsByBodyPart || {}) };

      const hasSavedContent = Boolean(
        (report.findings && report.findings.trim()) ||
        (report.impression && report.impression.trim()) ||
        Object.values(rMap).some((v) => v && String(v).trim()) ||
        Object.values(iMap).some((v) => v && String(v).trim())
      );

      let matchedTitle: string | null = null;
      let matchedTemplateKey = '';

      if (!hasSavedContent) {
        // Template auto-match by modality + body part (equality, case-insensitive trim)
        let matched: DocTemplate | null = null;
        const modality = (report.modality || '').trim();
        if (modality) {
          for (const bp of parts) {
            if (cancelled) return;
            try {
              matched = await ApiClient.matchTemplate(modality, bp);
            } catch (err) {
              console.warn('Template match error:', err);
              matched = null;
            }
            if (matched) break;
          }
        }

        if (matched) {
          const findingsText =
            matched.findings ||
            (matched.content ? matched.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '') ||
            '';
          const impressionVal = matched.impression || '';
          parts.forEach((p) => {
            rMap[p] = findingsText;
            iMap[p] = impressionVal;
          });
          matchedTitle = matched.title || null;
          matchedTemplateKey = matched.id ? `stored_${matched.id}` : '';
        } else {
          // No match: leave blank starting point (do not invent placeholder text)
          parts.forEach((p) => {
            rMap[p] = '';
            iMap[p] = '';
          });
        }
      } else {
        parts.forEach((p) => {
          if (!rMap[p]) {
            rMap[p] = report.findings || '';
          }
          if (!iMap[p]) {
            iMap[p] = report.impression || '';
          }
        });
      }

      if (cancelled) return;

      setBodyPartReports(rMap);
      setBodyPartImpressions(iMap);
      setActiveBodyPartIdx(0);

      const firstPart = parts[0];
      setReportTitle(matchedTitle || `X-RAY ${firstPart.toUpperCase()} EXAMINATION`);
      setFindingText(rMap[firstPart] || '');
      setImpressionText(iMap[firstPart] || '');
      setSelectedTemplateId(matchedTemplateKey);

    };

    initFromReport();
    return () => {
      cancelled = true;
    };
  }, [report, isOpen]);

  const seriesList = React.useMemo(() => {
    if (report) {
      const rawImages: string[] = [];
      if (report.dicomFileUrl) rawImages.push(report.dicomFileUrl);
      if (report.uploadedImages && report.uploadedImages.length > 0) {
        rawImages.push(...report.uploadedImages);
      }

      const images = Array.from(new Set(rawImages.filter((img) => img && typeof img === 'string' && img.trim() !== '')));

      if (images.length > 0) {
        return images.map((imgUrl, idx) => ({
          id: `report-img-${idx}`,
          title: `${report.bodyParts?.[idx] || report.bodyParts?.[0] || 'Radiograph'} (${report.patientNumber})`,
          modality: 'DX (Digital Radiography)',
          bodyPart: report.bodyParts?.[idx] || report.bodyParts?.[0] || 'X-RAY',
          studyDate: report.studyDate || new Date().toISOString().split('T')[0],
          seriesDescription: `${report.fullName} - ${report.bodyParts?.[idx] || 'Study Series'}`,
          kvp: '80 kVp',
          ma: '200 mA',
          exposureTime: '32 ms',
          pixelSpacing: '0.14 mm / px',
          rowsCols: '2048 x 2048',
          institution: report.radiologyCenterName || 'RADIONET PACS',
          imageUrl: imgUrl,
          ww: 1500,
          wl: -600,
        }));
      }

      return SAMPLE_DICOM_SERIES.map((s, idx) => ({
        ...s,
        title: `${report.bodyParts?.[idx] || report.bodyParts?.[0] || s.bodyPart} (${report.patientNumber})`,
        institution: report.radiologyCenterName || s.institution,
        studyDate: report.studyDate || s.studyDate,
        seriesDescription: `${report.fullName} - ${report.bodyParts?.[idx] || s.seriesDescription}`,
      }));
    }

    return SAMPLE_DICOM_SERIES;
  }, [report]);

  const [viewportSeries, setViewportSeries] = useState<number[]>([0, 1, 2, 3]);

  const [viewportStates, setViewportStates] = useState(
    [0, 1, 2, 3].map((idx) => ({
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      rotation: 0,
      flipH: false,
      flipV: false,
      ww: (seriesList[idx % seriesList.length] || seriesList[0]).ww,
      wl: (seriesList[idx % seriesList.length] || seriesList[0]).wl,
      invert: false,
    }))
  );

  const [imgSizes, setImgSizes] = useState<Record<number, { w: number; h: number }>>({});

  const [annotations, setAnnotations] = useState<Record<string, AnnotationLine[]>>({});

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDraw, setCurrentDraw] = useState<Partial<AnnotationLine> | null>(null);
  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(45);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);
  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);


  const currentStudyMeta = (() => {
    const parts = report?.bodyParts?.length ? report.bodyParts : [];
    const part = parts[activeBodyPartIdx] || parts[0];
    const studies = report?.studies || [];
    const match = studies.find((s) => s.bodyPart === part) || studies[activeBodyPartIdx];
    return { part, study: match, studies };
  })();

  const pendingStudyCount = (() => {
    const studies = report?.studies || [];
    if (studies.length) {
      return studies.filter((s) => (s.reportStatus || '').toUpperCase() !== 'SIGNED').length;
    }
    const parts = report?.bodyParts || [];
    return parts.filter((bp) => (studyStatuses[bp] || '').toUpperCase() !== 'SIGNED').length;
  })();

  const requestLeave = (action: () => void) => {
    if (pendingStudyCount > 0 && (report?.bodyParts?.length || 0) > 1) {
      setLeaveGuardAction(() => action);
      setLeaveGuardOpen(true);
      return;
    }
    action();
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingStudyCount > 0 && (report?.bodyParts?.length || 0) > 1) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingStudyCount, report?.bodyParts?.length]);

  // Sync technique + statuses when report / active part changes
  useEffect(() => {
    if (!report) return;
    const parts = report.bodyParts || [];
    const statusMap: Record<string, string> = {};
    const techMap: Record<string, string> = { ...(report.techniquesByBodyPart || {}) };
    (report.studies || []).forEach((s) => {
      if (s.bodyPart) {
        statusMap[s.bodyPart] = s.reportStatus || 'PENDING';
        if (s.technique) techMap[s.bodyPart] = s.technique;
      }
    });
    // Seed defaults
    parts.forEach((bp) => {
      if (!techMap[bp]) techMap[bp] = `${report.modality || 'Radiograph'} — ${bp}`;
      if (!statusMap[bp]) statusMap[bp] = 'PENDING';
    });
    setTechniqueByPart(techMap);
    setStudyStatuses(statusMap);
    const cur = parts[activeBodyPartIdx] || parts[0];
    if (cur) setTechniqueText(techMap[cur] || '');
  }, [report?.id]);


  const handleSaveAndSubmitReport = async () => {
    if (!report) {
      alert('No active patient report selected.');
      return;
    }

    setIsSubmitting(true);

    const parts = report.bodyParts && report.bodyParts.length > 0 ? report.bodyParts : ['GENERAL'];
    const currentPart = parts[activeBodyPartIdx] || parts[0];
    const studies = report.studies || [];
    const currentStudy =
      studies.find((s) => s.bodyPart === currentPart) || studies[activeBodyPartIdx];
    const studyId = currentStudy?.id;
    if (!studyId) {
      setIsSubmitting(false);
      alert('Could not resolve study for this body part. Re-open the case and try again.');
      return;
    }

    const finalReportsMap: Record<string, string> = {
      ...bodyPartReports,
      [currentPart]: findingText,
    };
    const finalImpressionsMap: Record<string, string> = {
      ...bodyPartImpressions,
      [currentPart]: impressionText,
    };
    const finalTechniqueMap: Record<string, string> = {
      ...techniqueByPart,
      [currentPart]: techniqueText || `${report.modality || 'Radiograph'} — ${currentPart}`,
    };

    const payload = {
      findings: findingText,
      impression: impressionText,
      technique: finalTechniqueMap[currentPart],
      templateId: selectedTemplateId || undefined,
      clinicalNotes: report.clinicalNotes,
      dicomSnapshots: [],
    };

    try {
      const result = await ApiClient.signStudyReport(report.id, studyId, payload);
      const updatedStudies = (result.report?.studies || studies).map((s) =>
        s.id === studyId
          ? { ...s, reportStatus: 'SIGNED', findings: findingText, impression: impressionText, technique: payload.technique }
          : s
      );
      const allSigned = (result.signedStudyCount || 0) >= (result.studyCount || parts.length);
      const updatedReport: XRayReport = {
        ...(result.report || report),
        ...report,
        status: allSigned || result.caseComplete ? 'Completed' : 'In Review',
        signatureApplied: allSigned || result.caseComplete,
        findings: findingText,
        impression: impressionText,
        reportsByBodyPart: finalReportsMap,
        impressionsByBodyPart: finalImpressionsMap,
        techniquesByBodyPart: finalTechniqueMap,
        dicomSnapshots: [],
        studies: updatedStudies,
        isPartial: !allSigned && (result.signedStudyCount || 0) > 0,
        signedStudyCount: result.signedStudyCount,
        studyCount: result.studyCount,
        pendingStudyCount: result.pendingStudyCount,
      };

      setBodyPartReports(finalReportsMap);
      setBodyPartImpressions(finalImpressionsMap);
      setTechniqueByPart(finalTechniqueMap);
      setStudyStatuses((prev) => ({ ...prev, [currentPart]: 'SIGNED' }));

      RadiologyStore.saveReport(updatedReport);
      if (allSigned || result.caseComplete) {
        RadiologyStore.updateReportStatus(report.id, 'Completed');
        window.dispatchEvent(
          new CustomEvent('radionline_report_completed', {
            detail: {
              report: updatedReport,
              message: `All studies completed for ${updatedReport.fullName}`,
            },
          })
        );
      }
      if (onSaveReport) onSaveReport(updatedReport);

      const toastMsg =
        result.toast ||
        `${currentPart} signed. ${result.signedStudyCount} of ${result.studyCount} done.`;
      setStatusToast(toastMsg);
      setTimeout(() => setStatusToast(null), 4000);

      // Auto-advance to next pending study
      if (result.nextStudyId || result.nextBodyPart) {
        const nextIdx = parts.findIndex(
          (bp, idx) =>
            bp === result.nextBodyPart ||
            updatedStudies[idx]?.id === result.nextStudyId ||
            (studyStatuses[bp] || updatedStudies.find((s) => s.bodyPart === bp)?.reportStatus || '') !== 'SIGNED' && bp !== currentPart
        );
        const fallbackIdx = parts.findIndex(
          (bp) => bp !== currentPart && (updatedStudies.find((s) => s.bodyPart === bp)?.reportStatus || studyStatuses[bp] || '') !== 'SIGNED'
        );
        const target = nextIdx >= 0 ? nextIdx : fallbackIdx;
        if (target >= 0) {
          // persist current maps then switch
          setTimeout(() => handleSwitchBodyPartTab(target), 300);
        }
      }

      setReportSavedSuccess(true);
      setTimeout(() => setReportSavedSuccess(false), 3500);
    } catch (err) {
      console.warn('Sign study error:', err);
      alert('Failed to sign this study. Please try again.');
    }

    setIsSubmitting(false);
  };

  const handleSaveDraft = async () => {
    if (!report || isSubmitting) return;
    setIsSubmitting(true);
    const parts = report.bodyParts || [];
    const currentPart = parts[activeBodyPartIdx] || parts[0] || 'CHEST PA/AP';
    const findingText = bodyPartReports[currentPart] || '';
    const impressionText = bodyPartImpressions[currentPart] || '';
    const techText = techniqueByPart[currentPart] || `${report.modality || 'X-Ray'} — ${currentPart}`;
    const studies = report.studies || [];
    const matchedStudy = studies.find((s) => s.bodyPart === currentPart) || studies[activeBodyPartIdx];
    const studyId = matchedStudy?.id || `${report.id}-st-${activeBodyPartIdx}`;

    try {
      await ApiClient.saveStudyDraft(report.id, studyId, {
        findings: findingText,
        impression: impressionText,
        technique: techText,
      });
      setStudyStatuses((prev) => ({ ...prev, [currentPart]: 'DRAFT' }));
      setStatusToast(`Draft saved for ${currentPart}`);
      setTimeout(() => setStatusToast(null), 3000);
    } catch (err: any) {
      console.warn('Save draft error:', err);
      setStatusToast('Failed to save draft');
      setTimeout(() => setStatusToast(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToolClick = (tool: ToolMode) => {
    setActiveTool(tool);
    setShowToolsDrawer(false);
    setMobileActiveView('dicom');
  };

  const handleGridChange = (layout: GridLayout) => {
    setGridLayout(layout);
  };

  const updateActiveViewport = (updater: (prev: typeof viewportStates[0]) => typeof viewportStates[0]) => {
    setViewportStates((prev) => {
      const next = [...prev];
      next[activeViewportIdx] = updater(next[activeViewportIdx]);
      return next;
    });
  };

  const handleApplyWwWlPreset = (preset: 'default' | 'bone' | 'soft' | 'lung' | 'brain') => {
    const currentSeries = seriesList[viewportSeries[activeViewportIdx] || 0] || seriesList[0];
    let ww = currentSeries.ww;
    let wl = currentSeries.wl;

    if (preset === 'bone') {
      ww = 2000;
      wl = 400;
    } else if (preset === 'soft') {
      ww = 400;
      wl = 50;
    } else if (preset === 'lung') {
      ww = 1500;
      wl = -500;
    } else if (preset === 'brain') {
      ww = 80;
      wl = 40;
    }

    updateActiveViewport((prev) => ({ ...prev, ww, wl }));
  };

  const handleResetActiveViewport = () => {
    const currentSeries = seriesList[viewportSeries[activeViewportIdx] || 0] || seriesList[0];
    updateActiveViewport(() => ({
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      rotation: 0,
      flipH: false,
      flipV: false,
      ww: currentSeries.ww,
      wl: currentSeries.wl,
      invert: false,
    }));
  };

  const handleDeleteLastAnnotation = () => {
    const activeSeries = seriesList[viewportSeries[activeViewportIdx] || 0] || seriesList[0];
    const seriesKey = activeSeries.id || activeSeries.imageUrl || `series-${viewportSeries[activeViewportIdx] || 0}`;
    setAnnotations((prev) => {
      const list = prev[seriesKey] || [];
      if (list.length === 0) return prev;
      return {
        ...prev,
        [seriesKey]: list.slice(0, list.length - 1),
      };
    });
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLDivElement>, vIdx: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const state = viewportStates[vIdx] || { zoom: 1.0, pan: { x: 0, y: 0 } };

    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const viewBoxX = (rawX / (rect.width || 1)) * 1000;
    const viewBoxY = (rawY / (rect.height || 1)) * 1000;

    const x = (viewBoxX - 500) / state.zoom - state.pan.x + 500;
    const y = (viewBoxY - 500) / state.zoom - state.pan.y + 500;

    return { x, y };
  };

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>, vIdx: number) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    setActiveViewportIdx(vIdx);
    const { x, y } = getCanvasCoords(e, vIdx);
    setDragStart({ x: e.clientX, y: e.clientY });

    if (['measure', 'angle', 'cobb', 'roi_ellipse'].includes(activeTool)) {
      setIsDrawing(true);
      const type = activeTool === 'roi_ellipse' ? 'ellipse' : (activeTool as any);
      setCurrentDraw({
        id: Date.now().toString(),
        type,
        x1: x,
        y1: y,
        x2: x + 20,
        y2: y + 20,
        x3: x - 35,
        y3: y + 80,
        x4: x + 35,
        y4: y + 85,
      });
    }
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>, vIdx: number) => {
    const { x, y } = getCanvasCoords(e, vIdx);

    if (activeTool === 'magnifier') {
      const rect = e.currentTarget.getBoundingClientRect();
      setMagnifierPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (!dragStart) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (isDrawing && currentDraw) {
      if (currentDraw.type === 'cobb') {
        setCurrentDraw((prev) => ({
          ...prev,
          x2: x,
          y2: y,
          x3: (prev?.x1 || 0) - 35,
          y3: (prev?.y1 || 0) + 80,
          x4: x - 35,
          y4: y + 80,
        }));
      } else {
        setCurrentDraw((prev) => ({
          ...prev,
          x2: x,
          y2: y,
        }));
      }
    } else if (activeTool === 'pan') {
      const rect = e.currentTarget.getBoundingClientRect();
      const state = viewportStates[vIdx] || { zoom: 1.0, pan: { x: 0, y: 0 } };
      const viewBoxDx = (dx / state.zoom) * (1000 / (rect.width || 1));
      const viewBoxDy = (dy / state.zoom) * (1000 / (rect.height || 1));
      updateActiveViewport((prev) => ({
        ...prev,
        pan: { x: prev.pan.x + viewBoxDx, y: prev.pan.y + viewBoxDy },
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === 'zoom') {
      updateActiveViewport((prev) => ({
        ...prev,
        zoom: Math.max(0.4, Math.min(4.0, prev.zoom - dy * 0.005)),
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === 'wwwl') {
      updateActiveViewport((prev) => ({
        ...prev,
        ww: Math.max(10, prev.ww + dx * 2),
        wl: Math.max(-1000, Math.min(2000, prev.wl - dy * 2)),
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === 'stack') {
      if (Math.abs(dy) > 15) {
        const seriesLength = SAMPLE_DICOM_SERIES.length;
        const delta = dy > 0 ? 1 : -1;
        setViewportSeries((prev) => {
          const next = [...prev];
          const currentIdx = next[vIdx] || 0;
          next[vIdx] = (currentIdx + delta + seriesLength) % seriesLength;
          return next;
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>, vIdx: number) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (isDrawing && currentDraw && currentDraw.x1 !== undefined && currentDraw.y1 !== undefined) {
      const x1 = currentDraw.x1;
      const y1 = currentDraw.y1;
      const x2 = currentDraw.x2 || x1 + 10;
      const y2 = currentDraw.y2 || y1 + 10;

      let label = '';
      if (currentDraw.type === 'measure') {
        const distPx = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        label = `${(distPx * 0.14).toFixed(1)} mm`;
      } else if (currentDraw.type === 'ellipse') {
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const area = ((Math.PI * rx * ry) / 600).toFixed(1);
        label = `Area: ${area} cm² (HU: ${Math.round(44 + (rx + ry) / 4)})`;
      } else if (currentDraw.type === 'cobb') {
        const a1 = Math.atan2(y2 - y1, x2 - x1);
        const y4 = currentDraw.y4 || y2 + 60;
        const x4 = currentDraw.x4 || x2 - 20;
        const y3 = currentDraw.y3 || y1 + 60;
        const x3 = currentDraw.x3 || x1 - 20;
        const a2 = Math.atan2(y4 - y3, x4 - x3);
        let diff = Math.abs(a1 - a2) * (180 / Math.PI);
        if (diff > 90) diff = 180 - diff;
        label = `Cobb Angle: ${diff.toFixed(1)}°`;
      } else if (currentDraw.type === 'angle') {
        label = `Angle: 44.2°`;
      }

      const finalAnn: AnnotationLine = {
        id: Date.now().toString(),
        type: currentDraw.type || 'measure',
        x1,
        y1,
        x2,
        y2,
        x3: currentDraw.x3,
        y3: currentDraw.y3,
        x4: currentDraw.x4,
        y4: currentDraw.y4,
        label,
      };

      const currentSeries = seriesList[viewportSeries[vIdx] || 0] || seriesList[0];
      const seriesKey = currentSeries.id || currentSeries.imageUrl || `series-${viewportSeries[vIdx] || 0}`;

      setAnnotations((prev) => ({
        ...prev,
        [seriesKey]: [...(prev[seriesKey] || []), finalAnn],
      }));
    }

    setIsDrawing(false);
    setCurrentDraw(null);
    setDragStart(null);
  };

  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>, vIdx: number) => {
    e.preventDefault();
    setActiveViewportIdx(vIdx);

    if (activeTool === 'stack') {
      const seriesLength = seriesList.length;
      const delta = e.deltaY > 0 ? 1 : -1;
      setViewportSeries((prev) => {
        const next = [...prev];
        const currentIdx = next[vIdx] || 0;
        next[vIdx] = (currentIdx + delta + seriesLength) % seriesLength;
        return next;
      });
    } else {
      const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
      updateActiveViewport((prev) => ({
        ...prev,
        zoom: Math.max(0.4, Math.min(4.0, prev.zoom + zoomDelta)),
      }));
    }
  };



  const numViewports = gridLayout === '1x1' ? 1 : gridLayout === '1x2' ? 2 : gridLayout === '2x1' ? 2 : 4;

  const toolsList: { id: ToolMode; label: string; icon: React.ReactNode }[] = [
    { id: 'pan', label: 'Move', icon: <Maximize2 className="w-4 h-4" /> },
    { id: 'zoom', label: 'Zoom', icon: <ZoomIn className="w-4 h-4" /> },
    { id: 'stack', label: 'Stack', icon: <Layers className="w-4 h-4" /> },
    { id: 'pointer', label: 'Pointer', icon: <MousePointer className="w-4 h-4" /> },
    { id: 'magnifier', label: 'Magnifier', icon: <Search className="w-4 h-4" /> },
    { id: 'wwwl', label: 'Windowing', icon: <Sun className="w-4 h-4" /> },
    { id: 'measure', label: 'Measure', icon: <Ruler className="w-4 h-4" /> },
    { id: 'angle', label: 'Angle', icon: <Sliders className="w-4 h-4" /> },
    { id: 'cobb', label: 'Cobb Angle', icon: <Activity className="w-4 h-4" /> },
    { id: 'roi_ellipse', label: 'Ellipse ROI', icon: <Circle className="w-4 h-4" /> },
  ];
  const primaryToolIds: ToolMode[] = ['pan', 'zoom', 'wwwl', 'measure'];
  const primaryTools = toolsList.filter((t) => primaryToolIds.includes(t.id));
  const overflowTools = toolsList.filter((t) => !primaryToolIds.includes(t.id));

  const handleSplitterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setIsDraggingSplitter(true);
  };

  const handleSplitterPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplitter || !workspaceContainerRef.current) return;
    const rect = workspaceContainerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const pct = (offsetX / rect.width) * 100;
    const clampedPct = Math.max(20, Math.min(80, pct));
    setLeftWidthPercent(clampedPct);
  };

  const handleSplitterPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSplitter) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      setIsDraggingSplitter(false);
    }
  };

  const patientName = report?.fullName || 'No Patient Selected';
  const patientAge = report?.age ? `${report.age} Yrs` : '—';
  const patientGender = report?.gender || '—';
  const patientId = report?.patientNumber || '—';
  const studyDate = report?.studyDate || '—';
  const reportDate = report?.createdAt
    ? new Date(report.createdAt).toLocaleString()
    : (report?.studyDate || new Date().toLocaleDateString());
  const radiologyCenterName = report?.radiologyCenterName || 'RADIONET DIAGNOSTICS & PACS HUB';

  // Referring doctor: use only referringPhysicianName. Never fall back to modality / assigned radiologist.
  const looksLikeModality = (s?: string | null) => {
    const v = (s || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!v) return true;
    const mods = ['xray', 'x-ray', 'xr', 'dx', 'cr', 'dr', 'ct', 'mri', 'usg', 'us', 'sono', 'sonography', 'ultrasound', 'blood', 'bloodreport'];
    return mods.some((m) => v === m.replace('-', '') || v === m);
  };
  const referringDoctorName = !looksLikeModality(report?.referringPhysicianName)
    ? (report?.referringPhysicianName || '').trim()
    : '';

  const reportingDoctorId = report?.assignedDoctorId || report?.claimedByDoctorId || '';
  const reportingDoctorRecord = reportingDoctorId
    ? RadiologyStore.getDoctors().find((d) => d.id === reportingDoctorId)
    : null;
  const doctorName =
    report?.assignedDoctorName ||
    report?.claimedByDoctorName ||
    reportingDoctorRecord?.fullName ||
    '';
  const doctorDegree = (report?.assignedDoctorDegree || reportingDoctorRecord?.degree || '').trim();
  const doctorRegNo = (report?.assignedDoctorRegNo || reportingDoctorRecord?.registrationNumber || '').trim();
  const doctorSignatureUrl = (reportingDoctorRecord?.signatureUrl || '').trim();

  const centerRecord = report?.radiologyCenterId
    ? allCenters.find((c) => c.id === report.radiologyCenterId) || RadiologyStore.getCenters().find((c) => c.id === report.radiologyCenterId)
    : null;
  const centerPhone = (centerRecord?.contactNumber || '').trim();
  const centerAddress = (centerRecord?.address || '').trim();
  const centerLogoUrl = (centerRecord?.logoUrl || '').trim();
  const studyModality = (report?.modality || '').trim();
  const studyPartsLabel = (report?.bodyParts || []).filter(Boolean).join(', ');

  const buildPrintPayload = (): PrintReportPayload => {
    const parts = report?.bodyParts?.length ? report.bodyParts : ['EXAMINATION'];
    const currentPart = parts[Math.min(activeBodyPartIdx, parts.length - 1)] || parts[0];
    const rMap = { ...bodyPartReports, [currentPart]: findingText };
    const iMap = { ...bodyPartImpressions, [currentPart]: impressionText };
    const techMap = { ...techniqueByPart, [currentPart]: techniqueText };
    const title = `${(studyModality || 'X-RAY').toUpperCase()} ${currentPart}`.trim();
    const studies = [
      {
        title,
        technique: techMap[currentPart] || [studyModality || 'Radiograph', currentPart].filter(Boolean).join(' — '),
        findings: (rMap[currentPart] || '').trim(),
        impression: (iMap[currentPart] || '').trim(),
      },
    ];
    const ageSex = `${patientAge} / ${patientGender && patientGender !== '—' ? patientGender.charAt(0).toUpperCase() : '—'}`;
    return {
      centerName: radiologyCenterName,
      centerAddress,
      centerPhone,
      centerLogoUrl,
      withHeader,
      patientName,
      patientId,
      ageSex,
      studyDate,
      referringDoctor: referringDoctorName,
      modality: studyModality,
      studyParts: currentPart,
      clinicalHistory: (report?.clinicalNotes || '').trim(),
      keyImageUrls: [],
      studies,
      doctorName,
      doctorDegree,
      doctorRegNo,
      doctorSignatureUrl,
      reportedAt: reportDate,
    };
  };

  const handlePrintCurrentStudy = () => {
    const payload = buildPrintPayload();
    const safe = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const part = report?.bodyParts?.[activeBodyPartIdx] || 'STUDY';
    const docTitle = `${safe(patientName)}_${safe(patientId)}_${safe(part)}`;
    printReportElement(null, docTitle, payload);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col overflow-hidden font-sans select-none print:static print:bg-white print:p-0 print:overflow-visible ${
      theme === 'dark' ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      

      {/* 1. COMPACT WORKSPACE TOP BAR */}
      <div className={`border-b px-2 sm:px-3 py-2 flex items-center gap-2 shrink-0 z-30 print:hidden no-print ${
        theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {/* Back / Close */}
        <button
          type="button"
          onClick={() => requestLeave(onClose)}
          className={`flex items-center justify-center h-10 w-10 shrink-0 rounded-lg transition-colors ${
            theme === 'dark' ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Close workspace"
          aria-label="Close workspace"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Patient + study summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className={`text-sm sm:text-base font-bold truncate leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {patientName}
            </h1>
            {report?.isUrgent && (
              <span className="shrink-0 px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold uppercase">
                STAT
              </span>
            )}
          </div>
          <div className={`text-[12px] sm:text-[13px] truncate leading-snug ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            <span>{patientAge !== '—' && patientAge !== '-' ? patientAge.replace(/ Yrs/i, 'y') : '—'} / {patientGender ? (String(patientGender).trim().toUpperCase().startsWith('F') ? 'F' : String(patientGender).trim().toUpperCase().startsWith('O') ? 'O' : 'M') : '—'}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="font-mono">{patientId}</span>
            <span className="mx-1.5 opacity-50 hidden sm:inline">·</span>
            <span className="hidden sm:inline">{report?.bodyParts?.join(', ') || report?.modality || 'Study'}</span>
            <span className="mx-1.5 opacity-50 hidden md:inline">·</span>
            <span className="hidden md:inline truncate">{radiologyCenterName}</span>
          </div>
        </div>

        {/* Mobile Activity shortcut */}
        {onOpenActivity && (
          <button
            type="button"
            onClick={onOpenActivity}
            className={`sm:hidden flex items-center justify-center h-10 w-10 shrink-0 rounded-lg border ${
              theme === 'dark'
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Case Activity"
            aria-label="Case Activity"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}

        {/* Mobile Viewer | Report tabs — large touch targets */}
        <div className={`flex lg:hidden p-0.5 rounded-lg border shrink-0 ${
          theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'
        }`}>
          <button
            type="button"
            onClick={() => setMobileActiveView('dicom')}
            className={`min-h-[40px] px-3 sm:px-4 text-[13px] font-semibold rounded-md transition-all ${
              mobileActiveView === 'dicom'
                ? (theme === 'dark' ? 'bg-[#009ef7] text-white shadow' : 'bg-[#009ef7] text-white shadow')
                : (theme === 'dark' ? 'text-slate-400' : 'text-slate-600')
            }`}
          >
            Viewer
          </button>
          <button
            type="button"
            onClick={() => setMobileActiveView('report')}
            className={`min-h-[40px] px-3 sm:px-4 text-[13px] font-semibold rounded-md transition-all ${
              mobileActiveView === 'report'
                ? (theme === 'dark' ? 'bg-[#009ef7] text-white shadow' : 'bg-[#009ef7] text-white shadow')
                : (theme === 'dark' ? 'text-slate-400' : 'text-slate-600')
            }`}
          >
            Report
          </button>
        </div>

        {/* Desktop / tablet-landscape primary actions */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {onOpenActivity && (
            <button
              type="button"
              onClick={onOpenActivity}
              className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-[13px] font-semibold transition-colors ${
                theme === 'dark'
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Case Activity"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Activity</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              handlePrintCurrentStudy();
            }}
            className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-[13px] font-semibold transition-colors ${
              theme === 'dark'
                ? 'border-slate-700 text-slate-100 hover:bg-slate-800'
                : 'border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
            title="Print Report or Save as PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden md:inline">Print / PDF</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-[13px] font-semibold transition-colors ${
              theme === 'dark'
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Save Draft Report"
          >
            <BookmarkPlus className="w-4 h-4 text-[#009ef7]" />
            <span className="hidden md:inline">Save Draft</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAndSubmitReport}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-bold transition-colors disabled:opacity-60"
            title="Save & Submit Report"
          >
            {reportSavedSuccess ? <CheckCircle2 className="w-4 h-4" /> : <FileCheck className="w-4 h-4" />}
            <span>{isSubmitting ? 'Submitting...' : reportSavedSuccess ? 'Submitted!' : 'Save & Submit'}</span>
          </button>
        </div>

        {/* More menu */}
        <div className="relative shrink-0" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className={`flex items-center justify-center h-10 w-10 rounded-lg border transition-colors ${
              theme === 'dark'
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="More actions"
            aria-label="More actions"
            aria-expanded={moreMenuOpen}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {moreMenuOpen && (
            <div className={`absolute right-0 top-full mt-1.5 w-56 rounded-lg border shadow-xl z-50 py-1 text-[13px] ${
              theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMoreMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
              >
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>

              <button
                type="button"
                onClick={() => { handleOpenSaveTemplate(); setMoreMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
              >
                <BookmarkPlus className="w-4 h-4" />
                Save New Template
              </button>
              <button
                type="button"
                onClick={() => { setIsReportingOpen(!isReportingOpen); setMoreMenuOpen(false); }}
                className={`w-full hidden lg:flex items-center gap-2 px-3 py-2.5 text-left ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
              >
                <FileText className="w-4 h-4" />
                {isReportingOpen ? 'Hide Report' : 'Show Report'}
              </button>
              {onOpenActivity && (
                <button
                  type="button"
                  onClick={() => { onOpenActivity(); setMoreMenuOpen(false); }}
                  className={`w-full flex sm:hidden items-center gap-2 px-3 py-2.5 text-left ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Activity
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handlePrintCurrentStudy();
                  setMoreMenuOpen(false);
                }}
                className={`w-full flex sm:hidden items-center gap-2 px-3 py-2.5 text-left ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
              >
                <Printer className="w-4 h-4" />
                Print / PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* History notes — single collapsible line */}
      {report && (
        <div className={`border-b shrink-0 print:hidden no-print ${
          theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => setHistoryExpanded((v) => !v)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
              theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {historyExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
            <span className={`font-semibold shrink-0 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>History </span>
            <span className={`truncate ${historyExpanded ? 'hidden' : ''}`}>
              {report.clinicalNotes || 'No prior clinical history recorded.'}
            </span>
          </button>
          {historyExpanded && (
            <p className={`px-3 pb-2 pl-9 text-[13px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {report.clinicalNotes || 'No prior clinical history recorded.'}
            </p>
          )}
        </div>
      )}

      {/* 4. MAIN WORKSTATION WORKSPACE */}
      <div
        ref={workspaceContainerRef}
        className={`flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-0 print:bg-white print:overflow-visible print:block ${
          theme === 'dark' ? 'bg-[#020617]' : 'bg-slate-200'
        }`}
      >

        {/* LEFT PANE: RADIOLOGY DOC REPORTING EDITOR */}
        {isReportingOpen && (
          <div
            style={{ width: isLgLayout ? `${leftWidthPercent}%` : '100%' }}
            className={`h-full min-h-0 border-r-0 flex flex-col overflow-hidden text-slate-900 shadow-2xl z-10 transition-none print:w-full print:max-w-none print:bg-white print:border-none print:shadow-none print:overflow-visible ${
              mobileActiveView === 'dicom' ? 'hidden lg:flex' : 'w-full lg:flex'
            } ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-200 text-slate-900'}`}
          >
            
            {/* Rich Formatting Toolbar */}
            <div className={`border-b p-1.5 flex flex-wrap items-center gap-1.5 text-[13px] shrink-0 select-none print:hidden no-print ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}>
              {/* REPORT TEMPLATE DROPDOWN SELECTOR */}
              <div className="flex items-center gap-1 min-w-0 flex-1 basis-[min(100%,18rem)]">
                <Sparkles className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-cyan-400' : 'text-blue-600'}`} />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const tId = e.target.value;
                    setSelectedTemplateId(tId);
                    if (!tId) return;

                    const htmlToPlain = (html: string) =>
                      html
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/gi, ' ')
                        .replace(/&amp;/gi, '&')
                        .replace(/&lt;/gi, '<')
                        .replace(/&gt;/gi, '>')
                        .replace(/\r\n/g, '\n')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();

                    const applyFindingsImpression = (rawFindings: string, rawImpression: string, content?: string) => {
                      let findings = (rawFindings || '').trim();
                      let impression = (rawImpression || '').trim();
                      if ((!findings || !impression) && content) {
                        const plain = htmlToPlain(content);
                        const parts = plain.split(/\bIMPRESSION(?:\s*&\s*CONCLUSION)?\s*:?/i);
                        if (parts.length >= 2) {
                          if (!findings) {
                            findings = parts[0].replace(/^(?:RADIOLOGICAL\s+)?FINDINGS\s*:?/i, '').trim();
                          }
                          if (!impression) {
                            impression = parts.slice(1).join('\n').trim();
                          }
                        } else if (!findings) {
                          findings = plain.replace(/^(?:RADIOLOGICAL\s+)?FINDINGS\s*:?/i, '').trim();
                        }
                      }
                      setFindingText(findings);
                      setImpressionText(impression);
                      const parts = report?.bodyParts?.length ? report.bodyParts : [];
                      const currentPart = parts[activeBodyPartIdx] || parts[0];
                      if (currentPart) {
                        setBodyPartReports((prev) => ({ ...prev, [currentPart]: findings }));
                        setBodyPartImpressions((prev) => ({ ...prev, [currentPart]: impression }));
                      }
                    };

                    if (tId.startsWith('stored_')) {
                      const id = tId.replace('stored_', '');
                      const tmpl = storedTemplates.find((t) => t.id === id);
                      if (tmpl) {
                        setReportTitle(tmpl.title);
                        applyFindingsImpression(tmpl.findings || '', tmpl.impression || '', tmpl.content);
                      }
                    } else {
                      const tmpl = RADIOLOGY_TEMPLATES.find((t) => t.id === tId);
                      if (tmpl) {
                        setReportTitle(tmpl.title);
                        applyFindingsImpression(tmpl.findings, tmpl.impression);
                      }
                    }
                  }}
                  className={`min-w-0 flex-1 max-w-full px-2 py-1.5 text-[13px] border font-semibold rounded cursor-pointer transition-all ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-cyan-500/50 text-cyan-300 hover:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
                      : 'bg-white border-blue-300 text-blue-800 hover:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs'
                  }`}
                >
                  <option value="">Load Report Template...</option>
                  {filteredTemplates.length === 0 && !showAllTemplates && (
                    <option value="" disabled>
                      No templates match modality/body part
                    </option>
                  )}
                  {filteredTemplates.map((tmpl) => (
                    <option
                      key={tmpl.id}
                      value={`stored_${tmpl.id}`}
                      className={theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                    >
                      [{tmpl.modality}{tmpl.bodyPart ? ` / ${tmpl.bodyPart}` : ''}] {tmpl.title} ({tmpl.centerName})
                    </option>
                  ))}
                </select>

                <label
                  className={`flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold border rounded cursor-pointer select-none ${
                    theme === 'dark'
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Show templates for all modalities and body parts"
                >
                  <input
                    type="checkbox"
                    checked={showAllTemplates}
                    onChange={(e) => setShowAllTemplates(e.target.checked)}
                    className="accent-[#009ef7]"
                  />
                  <span>All</span>
                </label>

                <button
                  type="button"
                  onClick={handleOpenSaveTemplate}
                  title="Save current findings as reusable template"
                  aria-label="Save New Template"
                  className={`min-h-[36px] min-w-[36px] px-2 text-xs font-bold border rounded flex items-center justify-center gap-1 transition-all cursor-pointer shrink-0 ${
                    saveTemplateSuccess
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : theme === 'dark'
                      ? 'bg-purple-950/80 border-purple-500/60 text-purple-300 hover:bg-purple-900 hover:text-white'
                      : 'bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200'
                  }`}
                >
                  {saveTemplateSuccess ? <CheckCircle2 className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                  <span className="hidden xl:inline whitespace-nowrap">{saveTemplateSuccess ? 'Saved!' : 'Save Template'}</span>
                </button>
              </div>

              <div className={`h-4 w-px mx-0.5 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`} />

              <button
                type="button"
                onClick={() => setWithHeader(!withHeader)}
                className={`px-2.5 py-1 text-[10px] font-bold border transition-all cursor-pointer rounded shrink-0 ${
                  withHeader
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500 font-extrabold' : 'bg-blue-600 text-white border-blue-500 font-extrabold')
                    : (theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-300')
                }`}
              >
                {withHeader ? 'Header Included' : 'No Header'}
              </button>

              <div className={`h-4 w-px mx-0.5 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`} />

              <button
                type="button"
                onClick={() => setIsBoldActive(!isBoldActive)}
                className={`p-1 border rounded font-bold transition-colors cursor-pointer ${
                  isBoldActive
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-blue-600 text-white border-blue-500')
                    : (theme === 'dark' ? 'hover:bg-slate-800 border-slate-700 text-slate-200' : 'hover:bg-slate-200 border-slate-300 text-slate-800')
                }`}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsItalicActive(!isItalicActive)}
                className={`p-1 border rounded italic transition-colors cursor-pointer ${
                  isItalicActive
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-blue-600 text-white border-blue-500')
                    : (theme === 'dark' ? 'hover:bg-slate-800 border-slate-700 text-slate-200' : 'hover:bg-slate-200 border-slate-300 text-slate-800')
                }`}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsUnderlineActive(!isUnderlineActive)}
                className={`p-1 border rounded underline transition-colors cursor-pointer ${
                  isUnderlineActive
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-blue-600 text-white border-blue-500')
                    : (theme === 'dark' ? 'hover:bg-slate-800 border-slate-700 text-slate-200' : 'hover:bg-slate-200 border-slate-300 text-slate-800')
                }`}
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <div className={`h-4 w-px mx-0.5 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`} />

              <button
                type="button"
                onClick={() => setReportTextAlign('text-left')}
                className={`p-1 border rounded transition-colors cursor-pointer ${
                  reportTextAlign === 'text-left'
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-blue-600 text-white border-blue-500')
                    : (theme === 'dark' ? 'hover:bg-slate-800 border-slate-700 text-slate-200' : 'hover:bg-slate-200 border-slate-300 text-slate-800')
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setReportTextAlign('text-center')}
                className={`p-1 border rounded transition-colors cursor-pointer ${
                  reportTextAlign === 'text-center'
                    ? (theme === 'dark' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-blue-600 text-white border-blue-500')
                    : (theme === 'dark' ? 'hover:bg-slate-800 border-slate-700 text-slate-200' : 'hover:bg-slate-200 border-slate-300 text-slate-800')
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>

              <div className={`h-4 w-px mx-0.5 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`} />

              <select
                value={reportFontFamily}
                onChange={(e) => setReportFontFamily(e.target.value as any)}
                className={`px-1 py-0.5 border text-xs font-sans rounded cursor-pointer ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="font-serif">Serif</option>
                <option value="font-sans">Sans-Serif</option>
                <option value="font-mono">Monospace</option>
              </select>

              <select
                value={reportFontSize}
                onChange={(e) => setReportFontSize(e.target.value as any)}
                className={`px-1 py-0.5 border text-xs rounded cursor-pointer ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="text-xs">Small (10pt)</option>
                <option value="text-sm">Normal (12pt)</option>
                <option value="text-base">Large (14pt)</option>
              </select>
            </div>

            {/* Editable Document Paper Canvas (A4 Format: 210mm x 297mm @ 96dpi = 794px x 1123px) */}
            <div
              className={`flex-1 min-h-0 p-3 sm:p-6 lg:p-8 overflow-y-auto flex justify-center items-start touch-pan-y overscroll-contain select-text print:bg-white print:p-0 print:overflow-visible print:block ${
                theme === 'dark' ? 'bg-[#090d16]' : 'bg-slate-300'
              }`}
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div
                className={`bg-white text-slate-900 w-full max-w-[794px] min-h-[1123px] h-auto p-6 sm:p-10 md:p-12 shadow-2xl border border-slate-200 text-xs sm:text-sm relative flex flex-col my-0 select-text rounded-xs print-area print:max-w-none print:w-full print:shadow-none print:border-none print:p-0 print:m-0 print:min-h-0 print:justify-start print:gap-4 ${reportFontFamily}`}
                data-print-ready="1"
                data-testid="report-print-area"
                style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
              >
                
                <div className="font-serif text-[13px] sm:text-[14px] leading-relaxed text-black">
                  {/* LETTERHEAD */}
                  {withHeader && (
                    <header className="border-b-2 border-black pb-3 mb-4 font-sans">
                      <div className="flex items-start gap-3">
                        {centerLogoUrl ? (
                          <img src={centerLogoUrl} alt="" className="w-14 h-14 object-contain shrink-0" />
                        ) : (
                          <div className="w-12 h-12 bg-black text-white font-bold flex items-center justify-center text-[10px] shrink-0 tracking-wide">
                            PACS
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h1 className="font-bold text-[15px] sm:text-[17px] text-black uppercase tracking-tight leading-tight">
                            {radiologyCenterName}
                          </h1>
                          {(centerAddress || centerPhone) && (
                            <p className="text-[11px] sm:text-[12px] text-slate-700 mt-0.5 leading-snug">
                              {[centerAddress, centerPhone ? `Tel: ${centerPhone}` : ''].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
                            ISO 9001:2015 Certified · NABL Accredited · 24×7 Teleradiology
                          </p>
                        </div>
                      </div>
                    </header>
                  )}

                  {/* PATIENT DEMOGRAPHICS TABLE */}
                  <table className="w-full border-collapse border border-black text-[12px] sm:text-[13px] font-sans mb-5">
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="p-2 border-r border-black w-1/2">
                          <span className="text-slate-600">Patient Name</span><br />
                          <strong className="uppercase text-black">{patientName}</strong>
                        </td>
                        <td className="p-2 w-1/2">
                          <span className="text-slate-600">Patient ID</span><br />
                          <strong className="text-black">{patientId}</strong>
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="p-2 border-r border-black">
                          <span className="text-slate-600">Age / Sex</span><br />
                          <strong className="text-black">{patientAge} / {patientGender && patientGender !== '—' ? patientGender.charAt(0).toUpperCase() : '—'}</strong>
                        </td>
                        <td className="p-2">
                          <span className="text-slate-600">Date of Study</span><br />
                          <strong className="text-black">{studyDate}</strong>
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="p-2 border-r border-black">
                          <span className="text-slate-600">Referring Doctor</span><br />
                          <strong className="text-black">{referringDoctorName || '—'}</strong>
                        </td>
                        <td className="p-2">
                          <span className="text-slate-600">Modality</span><br />
                          <strong className="text-black">{studyModality || '—'}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-black" colSpan={2}>
                          <span className="text-slate-600">Study / Body Part</span><br />
                          <strong className="text-black uppercase">{studyPartsLabel || reportTitle || '—'}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* CLINICAL HISTORY */}
                  <section className="mb-4">
                    <h2 className="font-sans font-bold text-[13px] uppercase tracking-wide border-b border-black pb-1 mb-2 text-black">
                      Clinical History
                    </h2>
                    <p className="text-[13px] sm:text-[14px] text-black whitespace-pre-wrap">
                      {report?.clinicalNotes?.trim() || 'Not provided.'}
                    </p>
                  </section>

                  {/* Multi-study editor chrome — screen only */}
                  {report?.bodyParts && report.bodyParts.length > 1 && (
                    <div className="my-3 p-2 bg-slate-50 border border-slate-300 font-sans print:hidden no-print">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-[12px] font-semibold text-slate-700">
                          Multiple studies ({report.bodyParts.length}) — select to edit
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {activeBodyPartIdx + 1} / {report.bodyParts.length}
                        </span>
                      </div>
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {report.bodyParts.map((part, idx) => (
                          <button
                            key={part}
                            type="button"
                            onClick={() => handleSwitchBodyPartTab(idx)}
                            className={`px-2.5 py-1.5 text-[12px] font-semibold rounded border transition-all cursor-pointer shrink-0 ${
                              activeBodyPartIdx === idx
                                ? 'bg-[#009ef7] text-white border-[#009ef7]'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            <span>{part}</span>
                            {(() => {
                              const st = (studyStatuses[part] || report?.studies?.find((s) => s.bodyPart === part)?.reportStatus || 'PENDING').toUpperCase();
                              const label = st === 'SIGNED' ? 'Signed' : st === 'DRAFT' ? 'Draft' : 'Pending';
                              const cls = st === 'SIGNED' ? 'bg-emerald-500/20 text-emerald-700 border-emerald-400' : st === 'DRAFT' ? 'bg-amber-500/20 text-amber-700 border-amber-400' : 'bg-slate-200 text-slate-600 border-slate-300';
                              return <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded border ${cls}`}>{label}</span>;
                            })()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}



                  {/* PER-STUDY SECTIONS */}
                  {(report?.bodyParts && report.bodyParts.length > 0 ? report.bodyParts : ['EXAMINATION']).map((part, idx) => {
                    const isActive = (report?.bodyParts?.length || 0) <= 1 || idx === activeBodyPartIdx;
                    const findingsVal = isActive ? findingText : (bodyPartReports[part] || '');
                    const impressionVal = isActive ? impressionText : (bodyPartImpressions[part] || '');
                    const techniqueLine = [studyModality || 'Radiograph', part].filter(Boolean).join(' — ');
                    const sectionTitle = studyModality
                      ? `${studyModality.toUpperCase()} ${part}`.trim()
                      : (reportTitle || `X-RAY ${part}`);

                    return (
                      <section
                        key={part}
                        className={`mb-5 ${!isActive ? 'opacity-90' : ''}`}
                        onClick={() => {
                          if (report?.bodyParts && report.bodyParts.length > 1 && idx !== activeBodyPartIdx) {
                            handleSwitchBodyPartTab(idx);
                          }
                        }}
                      >
                        <h2 className="font-sans font-bold text-[14px] sm:text-[15px] uppercase tracking-wide text-center underline decoration-1 underline-offset-4 mb-3 text-black">
                          {(report?.bodyParts?.length || 0) <= 1 ? (
                            <>
                              <input
                                type="text"
                                value={reportTitle}
                                onChange={(e) => setReportTitle(e.target.value)}
                                className="w-full text-center font-bold uppercase underline bg-transparent border-0 focus:outline-none text-black print:hidden no-print"
                              />
                              <span className="hidden print:inline">{reportTitle}</span>
                            </>
                          ) : (
                            sectionTitle
                          )}
                        </h2>

                        <div className="mb-3">
                          <h3 className="font-sans font-bold text-[12px] sm:text-[13px] uppercase tracking-wide text-black mb-1">
                            Technique
                          </h3>
                          <p className="text-[13px] sm:text-[14px] text-black">{techniqueLine}</p>
                        </div>

                        <div className={`mb-3 ${reportTextAlign} ${isBoldActive ? 'font-bold' : ''} ${isItalicActive ? 'italic' : ''} ${isUnderlineActive ? 'underline' : ''}`}>
                          <h3 className="font-sans font-bold text-[12px] sm:text-[13px] uppercase tracking-wide text-black mb-1 not-italic no-underline">
                            Findings
                          </h3>
                          {isActive ? (
                            <SpellCheckTextarea
                              rows={8}
                              value={findingText}
                              onChange={(val) => setFindingText(val)}
                              fontClass={`${reportFontFamily} ${reportFontSize} leading-relaxed`}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap text-[13px] sm:text-[14px] text-black min-h-[3rem]">
                              {findingsVal || '—'}
                            </p>
                          )}
                        </div>

                        <div className="mb-2">
                          <h3 className="font-sans font-bold text-[12px] sm:text-[13px] uppercase tracking-wide text-black mb-1">
                            Impression
                          </h3>
                          {isActive ? (
                            <SpellCheckTextarea
                              rows={3}
                              value={impressionText}
                              onChange={(val) => setImpressionText(val)}
                              fontClass={`${reportFontFamily} ${reportFontSize} font-bold leading-relaxed`}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap font-semibold text-[13px] sm:text-[14px] text-black">
                              {impressionVal || '—'}
                            </p>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {/* SIGNATURE BLOCK */}
                <footer className="mt-auto pt-8 font-sans text-[12px] sm:text-[13px] text-black">
                  <div className="flex flex-col items-end text-right gap-1 min-h-[88px]">
                    {doctorSignatureUrl ? (
                      <img src={doctorSignatureUrl} alt="Signature" className="h-14 object-contain mb-1" />
                    ) : null}
                    <p className="font-bold text-[13px] sm:text-[14px]">{doctorName || 'Reporting Radiologist'}</p>
                    {doctorDegree ? <p className="text-slate-800">{doctorDegree}</p> : null}
                    {doctorRegNo ? <p className="text-slate-700">{doctorRegNo}</p> : null}
                    <p className="text-slate-600 text-[11px] sm:text-[12px] mt-1">Reported: {reportDate}</p>
                  </div>

                  <div className="mt-6 pt-3 border-t border-slate-400">
                    <p className="text-[10px] sm:text-[11px] text-slate-600 italic leading-snug">
                      This report is based on the images provided and should be correlated clinically. It is not a substitute for clinical judgment.
                    </p>
                    <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                      <span>{radiologyCenterName}</span>
                      <span className="print-page-num">Page 1</span>
                    </div>
                  </div>
                </footer>

              </div>
            </div>

            {/* Mobile sticky primary actions (Report tab) */}
            <div className={`lg:hidden shrink-0 border-t px-3 py-2 flex items-center gap-2 print:hidden no-print ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              {onOpenActivity && (
                <button
                  type="button"
                  onClick={onOpenActivity}
                  className={`flex items-center justify-center h-11 w-11 rounded-lg border ${
                    theme === 'dark' ? 'border-slate-700 text-slate-200' : 'border-slate-300 text-slate-700'
                  }`}
                  title="Activity"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handlePrintCurrentStudy();
                }}
                className={`flex items-center justify-center gap-1.5 h-11 px-3 rounded-lg border text-[13px] font-semibold ${
                  theme === 'dark' ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-800'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span className="hidden xs:inline">PDF</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAndSubmitReport}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-bold disabled:opacity-60"
              >
                {reportSavedSuccess ? <CheckCircle2 className="w-5 h-5" /> : <FileCheck className="w-5 h-5" />}
                {isSubmitting ? 'Submitting...' : reportSavedSuccess ? 'Submitted!' : 'Save & Submit'}
              </button>
            </div>

            {/* Bottom Thumbnail Bar */}
            <div className="bg-slate-900 border-t border-slate-800 p-2 flex items-center gap-2 overflow-x-auto text-xs shrink-0 no-scrollbar print:hidden no-print">
              <span className="text-[10px] font-bold font-mono text-slate-400 shrink-0">{studyDate}</span>

              {seriesList.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setViewportSeries((prev) => {
                      const next = [...prev];
                      next[activeViewportIdx] = idx;
                      return next;
                    });
                  }}
                  className={`w-14 h-11 border-2 cursor-pointer relative overflow-hidden rounded shrink-0 ${
                    viewportSeries[activeViewportIdx] === idx ? 'border-cyan-400 ring-2 ring-cyan-500/40' : 'border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-cyan-300 text-[8px] font-mono text-center font-bold truncate">
                    {s.bodyPart.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DRAGGABLE RESIZABLE GRID SPLITTER BAR */}
        {isReportingOpen && (
          <div
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={handleSplitterPointerUp}
            onPointerCancel={handleSplitterPointerUp}
            onDoubleClick={() => setLeftWidthPercent(45)}
            className={`hidden lg:flex w-2.5 bg-slate-950 border-x border-slate-800 hover:border-cyan-500/60 hover:bg-cyan-500/10 cursor-col-resize select-none items-center justify-center shrink-0 z-30 transition-colors group print:hidden no-print ${
              isDraggingSplitter ? 'bg-cyan-500/20 border-cyan-400' : ''
            }`}
            title="Drag to resize DOC / DICOM split (Double-click to reset 45/55)"
          >
            <div className="w-1.5 h-8 bg-slate-700 group-hover:bg-cyan-400 rounded-full flex items-center justify-center pointer-events-none transition-colors">
              <GripVertical className="w-3 h-3 text-slate-950" />
            </div>
          </div>
        )}
        {/* RIGHT PANE: viewer toolbar + DICOM grid (toolbar attached to viewer only) */}
        <div
          className={`bg-black flex-1 min-h-0 flex flex-col overflow-hidden select-none relative print:hidden no-print transition-none ${
            isReportingOpen && mobileActiveView === 'report' ? 'hidden lg:flex' : 'w-full flex'
          }`}
          style={{
            width: !isLgLayout ? '100%' : (isReportingOpen ? `${100 - leftWidthPercent}%` : '100%'),
          }}
        >
          {/* Single consolidated viewer toolbar */}
          <div
            data-testid="viewer-toolbar"
            className={`shrink-0 border-b px-2 pl-12 lg:pl-2 py-1.5 flex items-center gap-1 select-none text-[13px] print:hidden no-print order-last lg:order-none ${
              theme === 'dark' ? 'bg-slate-900/95 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {primaryTools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleToolClick(t.id)}
                title={t.label}
                className={`flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] px-2 rounded-lg text-[12px] font-semibold shrink-0 ${
                  activeTool === t.id
                    ? 'bg-[#009ef7] text-white'
                    : (theme === 'dark' ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200')
                }`}
              >
                {t.icon}
                <span className="hidden 2xl:inline">{t.label}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={handleResetActiveViewport}
              title="Reset view"
              className={`flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] px-2 rounded-lg text-[12px] font-semibold shrink-0 ${
                theme === 'dark' ? 'bg-slate-800/80 hover:bg-slate-700 text-cyan-300' : 'bg-white hover:bg-slate-100 text-blue-700 border border-slate-200'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden 2xl:inline">Reset</span>
            </button>

            <div className="relative shrink-0" ref={toolsMoreRef}>
              <button
                type="button"
                onClick={() => setToolsMoreOpen((v) => !v)}
                title="More tools"
                aria-label="More tools"
                aria-expanded={toolsMoreOpen}
                className={`flex items-center gap-1 min-h-[40px] px-2.5 rounded-lg text-[12px] font-semibold shrink-0 ${
                  toolsMoreOpen || overflowTools.some((t) => t.id === activeTool)
                    ? 'bg-[#009ef7] text-white'
                    : (theme === 'dark' ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200')
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>More</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {toolsMoreOpen && (
                <div
                  className={`absolute z-50 w-[min(100vw-1.5rem,20rem)] max-h-[70vh] overflow-y-auto rounded-xl border shadow-2xl p-2 space-y-2 ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  } bottom-full mb-2 left-0 lg:bottom-auto lg:top-full lg:mt-2 lg:left-auto lg:right-0`}
                >
                  <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Tools</p>
                  <div className="grid grid-cols-2 gap-1">
                    {overflowTools.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { handleToolClick(t.id); setToolsMoreOpen(false); }}
                        className={`flex items-center gap-2 min-h-[40px] px-2 rounded-lg text-[13px] font-semibold text-left ${
                          activeTool === t.id
                            ? 'bg-[#009ef7] text-white'
                            : (theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50')
                        }`}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">View</p>
                  <div className="grid grid-cols-4 gap-1">
                    <button type="button" title="Zoom In" onClick={() => updateActiveViewport((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 0.25, 4.0) }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><ZoomIn className="w-4 h-4" /></button>
                    <button type="button" title="Zoom Out" onClick={() => updateActiveViewport((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 0.25, 0.4) }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><ZoomOut className="w-4 h-4" /></button>
                    <button type="button" title="Rotate CW" onClick={() => updateActiveViewport((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><RotateCw className="w-4 h-4" /></button>
                    <button type="button" title="Rotate CCW" onClick={() => updateActiveViewport((prev) => ({ ...prev, rotation: (prev.rotation - 90 + 360) % 360 }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><RotateCcw className="w-4 h-4" /></button>
                    <button type="button" title="Flip Horizontal" onClick={() => updateActiveViewport((prev) => ({ ...prev, flipH: !prev.flipH }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><FlipHorizontal className="w-4 h-4" /></button>
                    <button type="button" title="Flip Vertical" onClick={() => updateActiveViewport((prev) => ({ ...prev, flipV: !prev.flipV }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><FlipVertical className="w-4 h-4" /></button>
                    <button type="button" title="Invert" onClick={() => updateActiveViewport((prev) => ({ ...prev, invert: !prev.invert }))} className={`flex items-center justify-center min-h-[40px] rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><Sun className="w-4 h-4" /></button>
                    <button type="button" title="Undo line" onClick={handleDeleteLastAnnotation} className={`flex items-center justify-center min-h-[40px] rounded-lg text-amber-400 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}><Undo className="w-4 h-4" /></button>
                  </div>

                  <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">WW / WL</p>
                  <div className="flex flex-wrap gap-1">
                    {(['bone', 'soft', 'lung', 'brain'] as const).map((p) => (
                      <button key={p} type="button" onClick={() => { handleApplyWwWlPreset(p); setToolsMoreOpen(false); }} className={`min-h-[36px] px-3 rounded-lg text-[12px] font-semibold capitalize ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}>{p}</button>
                    ))}
                    <button type="button" onClick={() => { const activeSeries = seriesList[viewportSeries[activeViewportIdx] || 0] || seriesList[0]; const seriesKey = activeSeries.id || activeSeries.imageUrl || `series-${viewportSeries[activeViewportIdx] || 0}`; setAnnotations((prev) => ({ ...prev, [seriesKey]: [] })); setToolsMoreOpen(false); }} className="min-h-[36px] px-3 rounded-lg text-[12px] font-semibold text-rose-400">Clear</button>
                  </div>

                  <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Grid</p>
                  <div className="flex gap-1">
                    {(['1x1', '1x2', '2x1', '2x2'] as GridLayout[]).map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        onClick={() => { handleGridChange(layout); setToolsMoreOpen(false); }}
                        className={`min-h-[36px] flex-1 px-2 rounded-lg text-[12px] font-bold ${
                          gridLayout === layout ? 'bg-[#009ef7] text-white' : (theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')
                        }`}
                      >
                        {layout}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            className="flex-1 min-h-0 grid gap-1 p-1 overflow-hidden"
            style={{
              gridTemplateColumns: gridLayout === '2x1' || gridLayout === '2x2' ? '1fr 1fr' : '1fr',
              gridTemplateRows: gridLayout === '1x2' || gridLayout === '2x2' ? '1fr 1fr' : '1fr',
            }}
          >
          {Array.from({ length: numViewports }).map((_, vIdx) => {
            const seriesIdx = viewportSeries[vIdx] || 0;
            const series = seriesList[seriesIdx] || seriesList[0];
            const state = viewportStates[vIdx];
            const isActive = activeViewportIdx === vIdx;

            return (
              <div
                key={vIdx}
                onClick={() => setActiveViewportIdx(vIdx)}
                onPointerDown={(e) => handleViewportPointerDown(e, vIdx)}
                onPointerMove={(e) => handleViewportPointerMove(e, vIdx)}
                onPointerUp={(e) => handleViewportPointerUp(e, vIdx)}
                onPointerCancel={(e) => handleViewportPointerUp(e, vIdx)}
                onWheel={(e) => handleViewportWheel(e, vIdx)}
                className={`relative bg-black border overflow-hidden flex items-center justify-center cursor-crosshair touch-none select-none ${
                  isActive ? 'border-cyan-400 ring-2 ring-cyan-500/30' : 'border-slate-800/80'
                }`}
              >
                <div className="w-full h-full relative flex items-center justify-center bg-[#030712] overflow-hidden pointer-events-none">
                  
                  {/* TRANSFORMED CANVAS WRAPPER */}
                  <div
                    className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-75 select-none pointer-events-auto"
                    style={{
                      aspectRatio: imgSizes[vIdx] ? `${imgSizes[vIdx].w} / ${imgSizes[vIdx].h}` : '1 / 1',
                      transform: `scale(${state.zoom}) translate(${state.pan.x / 10}%, ${state.pan.y / 10}%) rotate(${state.rotation}deg) scaleX(${state.flipH ? -1 : 1}) scaleY(${state.flipV ? -1 : 1})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <img
                      src={series.imageUrl}
                      alt={series.title}
                      onDragStart={(e) => e.preventDefault()}
                      onLoad={(e) => {
                        const w = e.currentTarget.naturalWidth || 1000;
                        const h = e.currentTarget.naturalHeight || 1000;
                        setImgSizes((prev) => ({ ...prev, [vIdx]: { w, h } }));
                      }}
                      style={{
                        filter: `brightness(${100 + (state.wl - 200) / 20}%) contrast(${Math.max(50, 100 * ((2000 - state.ww) / 500 + 1))}%) ${state.invert ? 'invert(100%)' : ''}`,
                      }}
                      className="w-full h-full object-cover select-none pointer-events-none block"
                    />

                    {/* SVG Annotations Layer */}
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
                    >
                      {(() => {
                        const seriesKey = series.id || series.imageUrl || `series-${viewportSeries[vIdx] || 0}`;
                        const seriesAnnotations = annotations[seriesKey] || [];
                        return (seriesAnnotations).concat(currentDraw && activeViewportIdx === vIdx ? [currentDraw as AnnotationLine] : []).map((ann, aIdx) => {
                        if (ann.type === 'measure') {
                          const mx = (ann.x1 + ann.x2) / 2;
                          const my = (ann.y1 + ann.y2) / 2;
                          return (
                            <g key={ann.id || aIdx}>
                              <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke="#38bdf8" strokeWidth="3.5" strokeDasharray="6 3" />
                              <circle cx={ann.x1} cy={ann.y1} r="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                              <circle cx={ann.x2} cy={ann.y2} r="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                              <rect x={mx - 40} y={my - 16} width="80" height="26" rx="5" fill="#0f172a" opacity="0.9" stroke="#38bdf8" strokeWidth="1.5" />
                              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#38bdf8" fontSize="13" fontWeight="bold" fontFamily="monospace">
                                {ann.label || '34.5 mm'}
                              </text>
                            </g>
                          );
                        }

                        if (ann.type === 'ellipse') {
                          const cx = (ann.x1 + ann.x2) / 2;
                          const cy = (ann.y1 + ann.y2) / 2;
                          const rx = Math.abs(ann.x2 - ann.x1) / 2;
                          const ry = Math.abs(ann.y2 - ann.y1) / 2;
                          return (
                            <g key={ann.id || aIdx}>
                              <ellipse cx={cx} cy={cy} rx={Math.max(10, rx)} ry={Math.max(10, ry)} fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6 4" />
                              <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="#f59e0b" strokeWidth="2" />
                              <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke="#f59e0b" strokeWidth="2" />
                              <rect x={cx - 85} y={cy + ry + 10} width="170" height="28" rx="5" fill="#0f172a" opacity="0.9" stroke="#f59e0b" strokeWidth="1.5" />
                              <text x={cx} y={cy + ry + 22} textAnchor="middle" dominantBaseline="middle" fill="#fbbf24" fontSize="13" fontWeight="bold" fontFamily="monospace">
                                {ann.label || 'Area: 5.2 cm²'}
                              </text>
                            </g>
                          );
                        }

                        if (ann.type === 'cobb') {
                          const x3 = ann.x3 || ann.x1 - 35;
                          const y3 = ann.y3 || ann.y1 + 80;
                          const x4 = ann.x4 || ann.x2 - 35;
                          const y4 = ann.y4 || ann.y2 + 80;
                          const mx = (ann.x1 + ann.x2 + x3 + x4) / 4;
                          const my = (ann.y1 + ann.y2 + y3 + y4) / 4;
                          return (
                            <g key={ann.id || aIdx}>
                              <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke="#facc15" strokeWidth="4" />
                              <circle cx={ann.x1} cy={ann.y1} r="6" fill="#eab308" />
                              <circle cx={ann.x2} cy={ann.y2} r="6" fill="#eab308" />
                              <line x1={x3} y1={y3} x2={x4} y2={y4} stroke="#facc15" strokeWidth="4" />
                              <circle cx={x3} cy={y3} r="6" fill="#eab308" />
                              <circle cx={x4} cy={y4} r="6" fill="#eab308" />
                              <line x1={(ann.x1 + ann.x2) / 2} y1={(ann.y1 + ann.y2) / 2} x2={(x3 + x4) / 2} y2={(y3 + y4) / 2} stroke="#facc15" strokeWidth="2" strokeDasharray="4 4" />
                              <rect x={mx - 80} y={my - 15} width="160" height="30" rx="5" fill="#0f172a" opacity="0.95" stroke="#facc15" strokeWidth="1.5" />
                              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#facc15" fontSize="13" fontWeight="extrabold" fontFamily="monospace">
                                {ann.label || 'Cobb Angle: 22.4°'}
                              </text>
                            </g>
                          );
                        }

                        if (ann.type === 'angle') {
                          const mx = ann.x2;
                          const my = ann.y2 - 25;
                          return (
                            <g key={ann.id || aIdx}>
                              <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke="#10b981" strokeWidth="3.5" />
                              <line x1={ann.x2} y1={ann.y2} x2={ann.x2 + 70} y2={ann.y2 + 45} stroke="#10b981" strokeWidth="3.5" />
                              <circle cx={ann.x2} cy={ann.y2} r="7" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                              <rect x={mx - 55} y={my - 15} width="110" height="26" rx="5" fill="#0f172a" opacity="0.9" stroke="#10b981" strokeWidth="1.5" />
                              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#34d399" fontSize="13" fontWeight="bold" fontFamily="monospace">
                                {ann.label || 'Angle: 44.2°'}
                              </text>
                            </g>
                          );
                        }

                        return null;
                      });
                    })()}
                    </svg>
                  </div>

                  {/* Interactive Magnifier Lens Overlay */}
                  {activeTool === 'magnifier' && magnifierPos && isActive && (
                    <div
                      className="absolute w-36 h-36 rounded-full border-2 border-amber-400 overflow-hidden shadow-2xl pointer-events-none z-40 bg-black"
                      style={{
                        left: `${magnifierPos.x - 72}px`,
                        top: `${magnifierPos.y - 72}px`,
                      }}
                    >
                      <img
                        src={series.imageUrl}
                        alt="Magnified View"
                        style={{
                          transform: `scale(${state.zoom * 2.5}) translate(${state.pan.x - (magnifierPos.x - 150) / 2}px, ${state.pan.y - (magnifierPos.y - 150) / 2}px)`,
                          filter: `brightness(${100 + (state.wl - 200) / 20}%) contrast(${Math.max(50, 100 * ((2000 - state.ww) / 500 + 1))}%) ${state.invert ? 'invert(100%)' : ''}`,
                        }}
                        className="max-w-none max-h-none absolute w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 border-2 border-amber-400/40 rounded-full pointer-events-none" />
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/80 text-amber-400 text-[9px] font-mono px-1 font-bold rounded-xs">
                        2.5X MAGNIFIER
                      </span>
                    </div>
                  )}

                  {/* Top Left Metadata Overlay */}
                  <div className="absolute top-2 left-2 pointer-events-none font-mono text-[9px] sm:text-[10px] text-cyan-300 bg-slate-950/90 backdrop-blur-xs px-2.5 py-1 border border-slate-800 leading-tight max-w-[70%] truncate z-10 rounded">
                    <p className="font-bold text-white uppercase truncate">{series.title}</p>
                    <p className="text-slate-400 truncate">{series.institution}</p>
                  </div>

                  {/* Bottom Right DICOM Parameters Overlay */}
                  <div className="absolute bottom-2 right-2 pointer-events-none font-mono text-[9px] sm:text-[10px] text-slate-300 bg-slate-950/90 backdrop-blur-xs px-2.5 py-1 border border-slate-800 text-right leading-tight z-10 rounded">
                    <p>WW: {state.ww} | WL: {state.wl}</p>
                    <p>ZOOM: {(state.zoom * 100).toFixed(0)}% | ROT: {state.rotation}°</p>
                    <p className="text-cyan-400 font-bold">VIEWPORT #{vIdx + 1} {isActive ? '(ACTIVE)' : ''}</p>
                  </div>
</div>
              </div>
            );
          })}
          </div>
        </div>

      </div>

      {/* Save as Template Modal (DICOM Viewer Workstation) */}
      {saveTemplateModalOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 w-full max-w-xl shadow-2xl rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            
            {/* Modal Header */}
            <div className="bg-slate-950 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-md">
                  <BookmarkPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white tracking-wide uppercase font-mono">
                    Save PACS Workstation Template
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Convert active DICOM report findings & impression into a master template
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSaveTemplateModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form with 3 Required Options */}
            <form onSubmit={handleConfirmSaveTemplate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* Option 1: Template Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  1. Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={saveTmplTitle}
                  onChange={(e) => setSaveTmplTitle(e.target.value)}
                  placeholder="Enter template name..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs px-3 py-2 focus:border-purple-500 focus:outline-none transition-colors font-sans rounded"
                />
              </div>

              {/* Option 2: Center Selection (including All Centers) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  2. Which center template is this? <span className="text-rose-500">*</span>
                </label>
                <select
                  value={saveTmplCenterId}
                  onChange={(e) => setSaveTmplCenterId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs px-3 py-2 focus:border-purple-500 focus:outline-none transition-colors font-mono rounded"
                >
                  <option value="ALL">🌐 All Centers (Global Template)</option>
                  {allCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      🏥 {c.centerName}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 font-mono">
                  Select &quot;All Centers&quot; to share across all diagnostic labs or assign to a specific center.
                </p>
              </div>

              {/* Option 3: Modality */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  3. Modality <span className="text-rose-500">*</span>
                </label>
                <select
                  value={saveTmplModality}
                  onChange={(e) => setSaveTmplModality(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs px-3 py-2 focus:border-purple-500 focus:outline-none transition-colors font-mono rounded"
                >
                  {STUDY_MODALITY_OPTIONS.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Findings Preview */}
              <div className="space-y-1 bg-slate-950/60 p-3 border border-slate-800 rounded">
                <span className="text-[10px] uppercase text-slate-400 font-mono font-bold block">Findings Content Preview:</span>
                <p className="text-xs font-mono text-slate-300 line-clamp-3 leading-relaxed">
                  {findingText || 'No findings entered yet.'}
                </p>
              </div>

              {/* Active Impression Preview */}
              <div className="space-y-1 bg-slate-950/60 p-3 border border-slate-800 rounded">
                <span className="text-[10px] uppercase text-slate-400 font-mono font-bold block">Impression Content Preview:</span>
                <p className="text-xs font-mono text-slate-300 line-clamp-2 leading-relaxed">
                  {impressionText || 'No impression entered yet.'}
                </p>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSaveTemplateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md rounded"
                >
                  <BookmarkPlus className="w-4 h-4" /> Save New Template
                </button>
              </div>

            </form>
          </div>
        </div>
      )}


      {statusToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-xl print:hidden no-print">
          {statusToast}
        </div>
      )}
      {leaveGuardOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 print:hidden no-print">
          <div className="bg-white text-slate-900 rounded-xl shadow-2xl max-w-md w-full p-5">
            <h3 className="text-lg font-bold mb-2">Unfinished reports</h3>
            <p className="text-sm text-slate-600 mb-4">
              {pendingStudyCount} of {report?.bodyParts?.length || 0} reports for {report?.fullName || 'this patient'} {pendingStudyCount === 1 ? 'is' : 'are'} still pending. Are you sure you want to leave?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50"
                onClick={() => { setLeaveGuardOpen(false); setLeaveGuardAction(null); }}
              >
                Stay
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
                onClick={() => {
                  const act = leaveGuardAction;
                  setLeaveGuardOpen(false);
                  setLeaveGuardAction(null);
                  act?.();
                }}
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
