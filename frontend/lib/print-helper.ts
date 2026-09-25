/**
 * A4 Print Helper — builds a complete static report document (not a fragile live-DOM clone).
 * Opens a real-sized iframe, writes black-on-white A4 HTML with page breaks, then prints.
 */
export type PrintStudyBlock = {
  title: string;
  technique: string;
  findings: string;
  impression: string;
};

export type PrintReportPayload = {
  centerName: string;
  centerAddress?: string;
  centerPhone?: string;
  centerLogoUrl?: string;
  withHeader?: boolean;
  patientName: string;
  patientId: string;
  ageSex: string;
  studyDate: string;
  referringDoctor: string;
  modality: string;
  studyParts: string;
  clinicalHistory: string;
  keyImageUrls?: string[];
  studies: PrintStudyBlock[];
  doctorName: string;
  doctorDegree?: string;
  doctorRegNo?: string;
  doctorSignatureUrl?: string;
  reportedAt: string;
};

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string): string {
  return esc(s).replace(/\r\n|\n|\r/g, '<br/>');
}

export function buildReportPrintHtml(payload: PrintReportPayload, docTitle: string): string {
  const studiesHtml = (payload.studies || [])
    .map((st, i) => {
      const breakBefore = i > 0 ? 'page-break-before:auto;' : '';
      return `
      <section class="study" style="${breakBefore}">
        <h2 class="study-title">${esc(st.title)}</h2>
        <h3 class="sec">Technique</h3>
        <p class="body">${nl2br(st.technique || '—')}</p>
        <h3 class="sec">Findings</h3>
        <p class="body findings">${nl2br(st.findings || '—')}</p>
        <h3 class="sec">Impression</h3>
        <p class="body impression"><strong>${nl2br(st.impression || '—')}</strong></p>
      </section>`;
    })
    .join('\n');

  const images = (payload.keyImageUrls || []).filter(Boolean);
  const imagesHtml = images.length
    ? `<section class="key-images">
        <h3 class="sec">Key Images</h3>
        <div class="img-grid">
          ${images
            .map(
              (url, idx) =>
                `<figure class="img-cell"><img src="${esc(url)}" alt="Key image ${idx + 1}" /></figure>`
            )
            .join('')}
        </div>
      </section>`
    : '';

  const letterhead =
    payload.withHeader === false
      ? ''
      : `<header class="letterhead">
          <div class="lh-row">
            ${
              payload.centerLogoUrl
                ? `<img class="logo" src="${esc(payload.centerLogoUrl)}" alt="" />`
                : `<div class="logo-fallback">PACS</div>`
            }
            <div class="lh-text">
              <div class="center-name">${esc(payload.centerName)}</div>
              ${
                payload.centerAddress || payload.centerPhone
                  ? `<div class="center-meta">${esc(
                      [payload.centerAddress, payload.centerPhone ? `Tel: ${payload.centerPhone}` : '']
                        .filter(Boolean)
                        .join(' · ')
                    )}</div>`
                  : ''
              }
              <div class="accredit">ISO 9001:2015 Certified · NABL Accredited · 24×7 Teleradiology</div>
            </div>
          </div>
        </header>`;

  const sigImg = payload.doctorSignatureUrl
    ? `<img class="sig-img" src="${esc(payload.doctorSignatureUrl)}" alt="Signature" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(docTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 14mm 16mm 14mm;
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9pt;
        color: #444;
        font-family: system-ui, sans-serif;
      }
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body {
      margin: 0; padding: 0;
      background: #fff; color: #000;
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11pt; line-height: 1.55;
    }
    .sheet { width: 100%; max-width: 100%; overflow: visible; }
    .letterhead { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
    .lh-row { display: flex; gap: 12px; align-items: flex-start; }
    .logo { width: 56px; height: 56px; object-fit: contain; }
    .logo-fallback {
      width: 48px; height: 48px; background: #000; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; font-size: 9pt; font-weight: 700;
    }
    .center-name {
      font-family: system-ui, sans-serif; font-weight: 700;
      font-size: 14pt; text-transform: uppercase; letter-spacing: 0.02em;
    }
    .center-meta { font-family: system-ui, sans-serif; font-size: 9pt; color: #222; margin-top: 2px; }
    .accredit { font-family: system-ui, sans-serif; font-size: 8.5pt; color: #555; margin-top: 4px; }
    table.demo {
      width: 100%; border-collapse: collapse; margin: 0 0 14px 0;
      font-family: system-ui, sans-serif; font-size: 10pt;
    }
    table.demo td {
      border: 1px solid #000; padding: 7px 9px; vertical-align: top; width: 50%;
    }
    table.demo .lbl { display: block; color: #444; font-size: 8.5pt; margin-bottom: 2px; }
    table.demo .val { font-weight: 700; color: #000; text-transform: none; }
    h2.study-title {
      font-family: system-ui, sans-serif; font-size: 12pt; font-weight: 700;
      text-align: center; text-transform: uppercase; text-decoration: underline;
      margin: 18px 0 10px; page-break-after: avoid;
    }
    h3.sec {
      font-family: system-ui, sans-serif; font-size: 10pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em;
      margin: 10px 0 4px; border: none; page-break-after: avoid;
    }
    p.body { margin: 0 0 8px; white-space: pre-wrap; word-wrap: break-word; }
    p.findings, p.impression {
      border: none !important; outline: none !important;
      background: transparent !important; padding: 0 !important;
    }
    .study { page-break-inside: avoid; margin-bottom: 8px; }
    .key-images { margin: 12px 0 16px; page-break-inside: avoid; }
    .img-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .img-cell { width: calc(50% - 4px); border: 1px solid #333; margin: 0; padding: 0; overflow: hidden; }
    .img-cell img { display: block; width: 100%; height: 120px; object-fit: cover; }
    .clinical { margin-bottom: 12px; }
    .sig-block {
      margin-top: 28px; page-break-inside: avoid; break-inside: avoid;
      font-family: system-ui, sans-serif;
    }
    .sig-inner { text-align: right; min-height: 70px; }
    .sig-img { height: 52px; object-fit: contain; margin-bottom: 4px; }
    .sig-name { font-weight: 700; font-size: 11pt; }
    .sig-meta { font-size: 9.5pt; color: #222; }
    .disclaimer {
      margin-top: 22px; padding-top: 10px; border-top: 1px solid #666;
      font-size: 8.5pt; color: #444; font-style: italic; page-break-inside: avoid;
    }
    .foot {
      margin-top: 8px; display: flex; justify-content: space-between;
      font-family: system-ui, sans-serif; font-size: 8pt; color: #555;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${letterhead}
    <table class="demo">
      <tr>
        <td><span class="lbl">Patient Name</span><span class="val">${esc(payload.patientName)}</span></td>
        <td><span class="lbl">Patient ID</span><span class="val">${esc(payload.patientId)}</span></td>
      </tr>
      <tr>
        <td><span class="lbl">Age / Sex</span><span class="val">${esc(payload.ageSex)}</span></td>
        <td><span class="lbl">Date of Study</span><span class="val">${esc(payload.studyDate)}</span></td>
      </tr>
      <tr>
        <td><span class="lbl">Referring Doctor</span><span class="val">${esc(payload.referringDoctor || '—')}</span></td>
        <td><span class="lbl">Modality</span><span class="val">${esc(payload.modality || '—')}</span></td>
      </tr>
      <tr>
        <td colspan="2"><span class="lbl">Study / Body Part</span><span class="val">${esc(payload.studyParts || '—')}</span></td>
      </tr>
    </table>
    <section class="clinical">
      <h3 class="sec">Clinical History</h3>
      <p class="body">${nl2br(payload.clinicalHistory || 'Not provided.')}</p>
    </section>
    ${imagesHtml}
    ${studiesHtml}
    <footer class="sig-block">
      <div class="sig-inner">
        ${sigImg}
        <div class="sig-name">${esc(payload.doctorName || 'Reporting Radiologist')}</div>
        ${payload.doctorDegree ? `<div class="sig-meta">${esc(payload.doctorDegree)}</div>` : ''}
        ${payload.doctorRegNo ? `<div class="sig-meta">${esc(payload.doctorRegNo)}</div>` : ''}
        <div class="sig-meta">Reported: ${esc(payload.reportedAt)}</div>
      </div>
      <div class="disclaimer">
        This report is based on the images provided and should be correlated clinically. It is not a substitute for clinical judgment.
      </div>
      <div class="foot">
        <span>${esc(payload.centerName)}</span>
        <span class="pages">End of report</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

/** @deprecated keep name for call sites — now builds structured HTML */
export function printReportElement(
  _element: HTMLElement | null,
  docTitle: string = 'Radiology Report',
  payload?: PrintReportPayload
) {
  if (!payload || !payload.studies?.length) {
    console.error('printReportElement: structured payload required');
    window.print();
    return;
  }

  const html = buildReportPrintHtml(payload, docTitle);
  try {
    (window as unknown as { __RADIONLINE_LAST_PRINT_HTML__?: string }).__RADIONLINE_LAST_PRINT_HTML__ = html;
  } catch (_) {}

  // Real-sized iframe (0×0 iframes truncate/layout-collapse in Chromium)
  const existing = document.getElementById('radionline-print-iframe');
  if (existing?.parentNode) existing.parentNode.removeChild(existing);

  const iframe = document.createElement('iframe');
  iframe.id = 'radionline-print-iframe';
  iframe.setAttribute('title', 'Print report');
  iframe.style.position = 'fixed';
  iframe.style.left = '0';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Fallback: new window
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
      }, 400);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Print failed:', err);
    } finally {
      setTimeout(() => {
        try {
          if (iframe.parentNode) document.body.removeChild(iframe);
        } catch (_) {}
      }, 2000);
    }
  };

  // Wait for images
  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) {
    setTimeout(trigger, 250);
  } else {
    let left = imgs.length;
    const done = () => {
      left -= 1;
      if (left <= 0) setTimeout(trigger, 150);
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
    setTimeout(trigger, 3000); // safety
  }
}

/** Expose HTML builder for Playwright PDF verification without opening print dialog */
export function getReportPrintHtml(payload: PrintReportPayload, docTitle = 'Radiology Report') {
  return buildReportPrintHtml(payload, docTitle);
}
