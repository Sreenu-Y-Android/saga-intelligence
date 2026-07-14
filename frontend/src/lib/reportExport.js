import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import api from './api';

/* ═══════════════════════════════════════════════════════════════════
   Shared report export (PDF / Excel) for the Intelligence Dashboard
   aggregated payloads (`/intelligence/{profiles,alerts,grievances}`).
   "profiles" tab produces a Profile report, "alerts"/"grievances" tabs
   produce a Content report. Used by both the Intelligence Dashboard
   page and the Settings → Download Reports tab.
   ═══════════════════════════════════════════════════════════════════ */

export const PLATFORM_LABELS = { x: 'X (Twitter)', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', unknown: 'Other' };

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat('en-US');
export const fmt = (v, compact = false) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return compact ? compactFmt.format(n) : numFmt.format(n);
};
export const prettify = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const toRows = (arr, keyField, valueField = 'count', keyFmt = prettify) =>
  (arr || []).map((r) => [keyFmt(r[keyField]), fmt(r[valueField])]);

export const buildReportModel = (tab, data, dateFrom, dateTo) => {
  if (!data) return null;
  const dateRangeLabel = dateFrom && dateTo ? `Date Range: ${dateFrom} to ${dateTo}` : 'Date Range: All time';

  if (tab === 'profiles') {
    const summary = data.summary || {};
    return {
      title: 'Profiles Intelligence Report',
      fileBase: `profile_report_${new Date().toISOString().slice(0, 10)}`,
      dateRangeLabel,
      summary: [
        ['Total Profiles', fmt(summary.total)],
        ['Active', fmt(summary.active)],
        ['Archived', fmt(summary.archived)],
        ['Added in Range', fmt(summary.addedInRange)],
        ['With FIR', fmt(summary.withFIR)],
        ['With Reports', fmt(summary.withReports)],
        ['Deleted Profiles', fmt(summary.withDeletedProfiles)]
      ],
      sections: [
        { title: 'Platform Coverage', head: ['Platform', 'Count'], rows: toRows(data.platformDistribution, 'platform', 'count', (v) => PLATFORM_LABELS[v] || v) },
        { title: 'District / Commissionerate', head: ['District', 'Count'], rows: toRows(data.districtDistribution, 'district', 'count', (v) => v) },
        { title: 'Social Media Coverage', head: ['Platforms Linked', 'Profiles'], rows: (data.socialCoverage || []).map((r) => [`${r.linkedPlatforms} Platform${r.linkedPlatforms !== 1 ? 's' : ''}`, fmt(r.count)]) },
        { title: 'Profiles by Creator', head: ['Creator', 'Count'], rows: toRows(data.profilesByCreator, 'creator', 'count', (v) => v) },
        { title: 'Monthly Creation Trend', head: ['Month', 'Profiles'], rows: (data.monthlyTrend || []).map((r) => [r.month, fmt(r.count)]) }
      ]
    };
  }

  if (tab === 'alerts') {
    const riskDist = data.riskAnalysis?.distribution || [];
    return {
      title: 'Alerts Intelligence Report (Content)',
      fileBase: `content_report_alerts_${new Date().toISOString().slice(0, 10)}`,
      dateRangeLabel,
      summary: [
        ['Total Accounts', fmt(data.accounts?.total)],
        ['Active Accounts', fmt(data.accounts?.active)],
        ['Added in Range', fmt(data.accounts?.addedInRange)],
        ['Total Alerts', fmt(data.comparison?.alerts?.current)],
        ['Reports Generated', fmt(data.actions?.total)],
        ['High Risk Alerts', fmt(riskDist.find((r) => r.level === 'high')?.count)]
      ],
      sections: [
        { title: 'Risk Distribution', head: ['Risk Level', 'Count'], rows: toRows(riskDist, 'level', 'count') },
        { title: 'Platform Distribution', head: ['Platform', 'Count'], rows: toRows(data.platformDistribution, 'platform', 'count', (v) => PLATFORM_LABELS[v] || v) },
        { title: 'Alert Type Distribution', head: ['Type', 'Count'], rows: toRows(data.alertTypes, 'type', 'count') },
        { title: 'Escalation Status', head: ['Status', 'Count'], rows: toRows(data.escalations?.statusDistribution, 'status', 'count') },
        { title: 'Actions by Platform', head: ['Platform', 'Count'], rows: toRows(data.actions?.byPlatform, 'platform', 'count', (v) => PLATFORM_LABELS[v] || v) },
        { title: 'Keywords by Category', head: ['Category', 'Total', 'Active'], rows: (data.keywords?.byCategory || []).map((r) => [prettify(r.category), fmt(r.total), fmt(r.active)]) },
        { title: 'Top Matched Keywords', head: ['Keyword', 'Matches'], rows: (data.keywords?.topMatched || []).slice(0, 20).map((r) => [r.keyword, fmt(r.count)]) },
        {
          title: 'Top Active Accounts',
          head: ['Account', 'Handle', 'Platform', 'Total', 'High', 'Medium', 'Low'],
          rows: (data.topActiveAccounts || []).slice(0, 20).map((r) => [r.author, `@${r.handle}`, PLATFORM_LABELS[r.platform] || r.platform, fmt(r.alertCount), fmt(r.highRisk), fmt(r.mediumRisk), fmt(r.lowRisk)])
        },
        { title: 'Alert Status Summary', head: ['Status', 'Count'], rows: toRows(data.alertStatusSummary, 'status', 'count') }
      ]
    };
  }

  if (tab === 'grievances') {
    const eng = data.engagement || {};
    return {
      title: 'Grievances Intelligence Report (Content)',
      fileBase: `content_report_grievances_${new Date().toISOString().slice(0, 10)}`,
      dateRangeLabel,
      summary: [
        ['Total Grievances', fmt(data.summary?.total)],
        ['In Date Range', fmt(data.summary?.inRange)],
        ['Grievance Reports', fmt(data.grievanceReports?.total)],
        ['Pending', fmt(data.grievanceReports?.pending)],
        ['Suggestions', fmt(data.suggestions?.total)],
        ['Criticism', fmt(data.criticism?.total)],
        ['Total Views', fmt(eng.totalViews)],
        ['Total Likes', fmt(eng.totalLikes)]
      ],
      sections: [
        { title: 'Platform Distribution', head: ['Platform', 'Count'], rows: toRows(data.byPlatform, 'platform', 'count', (v) => PLATFORM_LABELS[v] || v) },
        { title: 'Workflow Status', head: ['Status', 'Count'], rows: toRows(data.workflowStatus, 'status', 'count') },
        { title: 'Classification', head: ['Type', 'Count'], rows: toRows(data.classification, 'type', 'count') },
        { title: 'Priority', head: ['Level', 'Count'], rows: toRows(data.priority, 'level', 'count') },
        { title: 'Grievance Report Status', head: ['Status', 'Count'], rows: toRows(data.grievanceReports?.statusDistribution, 'status', 'count', (v) => v) },
        { title: 'Grievance Report Categories', head: ['Category', 'Count'], rows: toRows(data.grievanceReports?.categoryDistribution, 'category', 'count', (v) => v) },
        { title: 'Suggestion Categories', head: ['Category', 'Count'], rows: toRows(data.suggestions?.categoryDistribution, 'category', 'count', (v) => v) },
        { title: 'Criticism Categories', head: ['Category', 'Count'], rows: toRows(data.criticism?.categoryDistribution, 'category', 'count', (v) => v) },
        { title: 'Sentiment', head: ['Sentiment', 'Count'], rows: toRows(data.sentiment, 'sentiment', 'count') },
        { title: 'Urgency', head: ['Level', 'Count'], rows: toRows(data.urgency, 'level', 'count') },
        { title: 'Top Tagged Accounts', head: ['Account', 'Mentions'], rows: (data.topTaggedAccounts || []).slice(0, 20).map((r) => [`@${r.account}`, fmt(r.count)]) }
      ]
    };
  }

  return null;
};

export const exportReportPDF = (model) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(model.title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 25);
  doc.text(model.dateRangeLabel, 14, 30);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 36,
    head: [['Metric', 'Value']],
    body: model.summary,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  let startY = doc.lastAutoTable.finalY + 10;
  model.sections.forEach((section) => {
    if (!section.rows.length) return;
    if (startY > 260) {
      doc.addPage();
      startY = 18;
    }
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(section.title, 14, startY);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: startY + 4,
      head: [section.head],
      body: section.rows,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    startY = doc.lastAutoTable.finalY + 10;
  });

  doc.save(`${model.fileBase}.pdf`);
};

export const exportReportExcel = (model) => {
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet([[model.title], [model.dateRangeLabel], [], ['Metric', 'Value'], ...model.summary]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const usedNames = new Set(['Summary']);
  model.sections.forEach((section) => {
    if (!section.rows.length) return;
    let sheetName = section.title.replace(/[\[\]\*\/\\\?:]/g, '').slice(0, 31) || 'Sheet';
    let suffix = 1;
    while (usedNames.has(sheetName)) {
      sheetName = `${sheetName.slice(0, 28)}_${suffix++}`;
    }
    usedNames.add(sheetName);
    const sheet = XLSX.utils.aoa_to_sheet([section.head, ...section.rows]);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wbOut], { type: 'application/octet-stream' }), `${model.fileBase}.xlsx`);
};

/* ═══════════════════════════════════════════════════════════════════
   ROW-LEVEL REPORTS (Alerts / Grievances) — matches bandisunjay's
   Intelligence Dashboard report format: one row per post (or deduped
   by author in "profiles" view mode), with a full per-item
   "Report Content Details" section rendered via html2canvas so
   Telugu/Hindi text renders correctly in the PDF.
   ═══════════════════════════════════════════════════════════════════ */

export const REPORT_EXPORT_BATCH_SIZE = 200;

export const TYPE_BADGE = {
  alert: { label: 'Alert' },
  grievance: { label: 'Grievance' },
  criticism: { label: 'Criticism' },
  suggestion: { label: 'Suggestion' }
};

export const normalizeTopicLabel = (topic) => {
  const raw = String(topic || '').trim();
  const normalized = raw.toLowerCase();
  if (['government praise', 'govt praise', 'general praise'].includes(normalized)) return 'General Complaint';
  return raw;
};

const truncateText = (value, max = 90) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

export const normalizeAlertReportRow = (alert) => ({
  ...alert,
  _type: 'alert',
  unique_code: alert?.id || '',
  _topic: normalizeTopicLabel(alert?.llm_analysis?.grievance_type),
  posted_by: {
    display_name: alert?.author || alert?.source_meta?.name || '',
    handle: alert?.content_details?.author_handle || alert?.author_handle || alert?.source_meta?.handle || ''
  },
  platform: alert?.platform || alert?.content_details?.platform || '',
  sentiment: alert?.risk_level || '',
  category: alert?.source_category || '',
  status: alert?.status || '',
  post_date: alert?.created_at || null,
  post_link: alert?.content_details?.content_url || alert?.content_url || '',
  post_description: String(
    alert?.content_details?.translated_text
    || alert?.content_details?.text
    || alert?.content_details?.scraped_content
    || alert?.description
    || alert?.title
    || ''
  ).replace(/\s+/g, ' ').trim(),
  grievance_text: String(
    alert?.content_details?.text
    || alert?.content_details?.scraped_content
    || alert?.description
    || alert?.title
    || ''
  ).replace(/\s+/g, ' ').trim(),
  translated_text: String(alert?.content_details?.translated_text || '').replace(/\s+/g, ' ').trim()
});

export const normalizeGrievanceReportRow = (report) => ({
  ...report,
  unique_code: report.complaint_code || report.id || '',
  posted_by: {
    display_name: report.complainant?.name || report.posted_by?.display_name || report.posted_by?.handle || 'Unknown',
    handle: report.complainant?.handle || report.posted_by?.handle || ''
  },
  post_description: report.content?.full_text || report.content?.text || '',
  sentiment: report.analysis?.sentiment || '',
  category: report.analysis?.category || '',
  topic: normalizeTopicLabel(report.analysis?.grievance_type || ''),
  risk_level: report.analysis?.risk_level || '',
  post_link: report.tweet_url || '',
  post_date: report.post_date || report.detected_date || null,
  status: report.workflow_status || report.complaint?.status || '',
  _type: 'grievance',
  grievance_text: report.content?.full_text || report.content?.text || ''
});

export const dedupeReportRowsByAuthor = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = (row.posted_by?.handle || row.posted_by?.display_name || '').toLowerCase().trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, { ...row, _postCount: 1 });
    else map.get(key)._postCount += 1;
  });
  return Array.from(map.values());
};

/** Paginate through /alerts or /grievances, normalizing every row. */
export const fetchAllRowsForExport = async (kind, params) => {
  const endpoint = kind === 'alerts' ? '/alerts' : '/grievances';
  const listKey = kind === 'alerts' ? 'alerts' : 'grievances';
  const normalize = kind === 'alerts' ? normalizeAlertReportRow : normalizeGrievanceReportRow;
  const collected = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await api.get(endpoint, { params: { ...params, page, limit: REPORT_EXPORT_BATCH_SIZE } });
    const rows = Array.isArray(res.data?.[listKey]) ? res.data[listKey] : [];
    collected.push(...rows.map(normalize));
    const pagination = res.data?.pagination || {};
    totalPages = Number(pagination.totalPages ?? pagination.pages) || (pagination.hasMore ? page + 1 : page);
    page += 1;
    if (!pagination.hasMore && page > totalPages) break;
    if (rows.length === 0) break;
  } while (page <= totalPages);

  return collected;
};

export const exportRowsPDF = async (reports, { fileName = 'report', title = 'Report', dateRangeLabel = 'All time', includeContentDetails = true, profilesMode = false } = {}) => {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = pageWidth - 14;
  doc.setFontSize(16);
  doc.text(title, left, 18);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')} | Period: ${dateRangeLabel}`, left, 25);
  doc.setTextColor(0);

  if (profilesMode) {
    autoTable(doc, {
      startY: 30,
      head: [['SNo.', 'Posted By', 'Handle', 'Platform', 'Risk/Sentiment', 'Category', 'Posts', 'Post Date', 'Post Link']],
      body: reports.map((r, i) => [
        i + 1,
        r.posted_by?.display_name || r.posted_by?.handle || '',
        r.posted_by?.handle || '',
        prettify(r.platform || ''),
        prettify(r.sentiment || ''),
        r.category || '',
        r._postCount || 1,
        r.post_date ? new Date(r.post_date).toLocaleDateString('en-GB') : '',
        truncateText(r.post_link || 'N/A', 60)
      ]),
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 252, 232] }
    });
  } else {
    autoTable(doc, {
      startY: 30,
      head: [['SNo.', 'Type', 'Code', 'Posted By', 'Platform', 'Risk/Sentiment', 'Category', 'Post Date', 'Post Link']],
      body: reports.map((r, i) => [
        i + 1,
        TYPE_BADGE[r._type]?.label || r._type,
        r.unique_code || '',
        r.posted_by?.display_name || r.posted_by?.handle || '',
        prettify(r.platform || ''),
        prettify(r.sentiment || ''),
        r.category || '',
        r.post_date ? new Date(r.post_date).toLocaleDateString('en-GB') : '',
        truncateText(r.post_link || 'N/A', 60)
      ]),
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 252, 232] }
    });
  }

  if (includeContentDetails && reports.length) {
    let y = (doc.lastAutoTable?.finalY || 30) + 10;
    const ensureSpace = (needed = 24) => {
      if (y + needed > pageHeight - 14) {
        doc.addPage('a4', 'landscape');
        y = 16;
      }
    };
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text('Report Content Details', left, y);
    y += 6;

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    for (let idx = 0; idx < reports.length; idx += 1) {
      const report = reports[idx];
      const displayContent = String(report.post_description || report.grievance_text || '').replace(/\s+/g, ' ').trim() || 'N/A';
      const translatedContent = String(report.translated_text || '').replace(/\s+/g, ' ').trim();
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-20000px';
      container.style.top = '0';
      container.style.width = '1180px';
      container.style.padding = '20px 24px';
      container.style.background = idx % 2 === 0 ? '#fffaf0' : '#ffffff';
      container.style.border = '1px solid #fde68a';
      container.style.borderRadius = '12px';
      container.style.boxSizing = 'border-box';
      container.style.color = '#0f172a';
      container.style.fontFamily = '"Noto Sans Telugu", "Nirmala UI", "Segoe UI", Arial, sans-serif';
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      container.innerHTML = `
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;">
          ${idx + 1}. ${esc(TYPE_BADGE[report._type]?.label || prettify(report._type || ''))} - ${esc(report.unique_code || '—')}
        </div>
        <div style="font-size:12px;color:#475569;margin-bottom:12px;line-height:1.5;">
          Posted By: ${esc(report.posted_by?.display_name || report.posted_by?.handle || '—')}
          ${report.posted_by?.handle ? ` (${esc(report.posted_by.handle)})` : ''}
          | Platform: ${esc(prettify(report.platform || 'unknown'))}
          | Risk/Sentiment: ${esc(prettify(report.sentiment || ''))}
          | Category: ${esc(report.category || '—')}
          | Date: ${report.post_date ? new Date(report.post_date).toLocaleDateString('en-GB') : 'N/A'}
        </div>
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:#1e293b;">Report Content</div>
        <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#111827;">${esc(displayContent)}</div>
        ${translatedContent && translatedContent !== displayContent ? `
          <div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:#1e293b;">Translated Content</div>
          <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#111827;">${esc(translatedContent)}</div>
        ` : ''}
        <div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:#1e293b;">Post Link</div>
        <div style="font-size:12px;line-height:1.5;word-break:break-all;color:#2563eb;">${esc(report.post_link || 'N/A')}</div>
      `;
      document.body.appendChild(container);
      const canvas = await html2canvas(container, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const contentWidth = right - left;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;
      ensureSpace(contentHeight + 4);
      doc.addImage(imgData, 'PNG', left, y, contentWidth, contentHeight, undefined, 'FAST');
      y += contentHeight + 6;
    }
  }

  doc.save(`${fileName}.pdf`);
};

export const exportRowsExcel = (reports, { fileName = 'report', title = 'Report', dateRangeLabel = 'All time', profilesMode = false } = {}) => {
  const rows = profilesMode
    ? reports.map((r, i) => ({
        '#': i + 1,
        'Posted By': r.posted_by?.display_name || r.posted_by?.handle || '',
        'Handle': r.posted_by?.handle || '',
        'Platform': prettify(r.platform || ''),
        'Risk/Sentiment': prettify(r.sentiment || ''),
        'Category': r.category || '',
        'Posts': r._postCount || 1,
        'Post Date': r.post_date ? new Date(r.post_date).toLocaleDateString('en-GB') : '',
        'Post Link': r.post_link || ''
      }))
    : reports.map((r, i) => ({
        '#': i + 1,
        'Type': TYPE_BADGE[r._type]?.label || r._type,
        'Unique Code': r.unique_code || '',
        'Posted By': r.posted_by?.display_name || r.posted_by?.handle || '',
        'Handle': r.posted_by?.handle || '',
        'Platform': prettify(r.platform || ''),
        'Risk/Sentiment': prettify(r.sentiment || ''),
        'Category': r.category || '',
        'Status': r.status || '',
        'Post Date': r.post_date ? new Date(r.post_date).toLocaleDateString('en-GB') : '',
        'Post Link': r.post_link || '',
        'Post Description': r.post_description || '',
        'Source Content': r.grievance_text || ''
      }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Field: 'Report', Value: title },
    { Field: 'Period', Value: dateRangeLabel },
    { Field: 'Total', Value: reports.length },
    { Field: 'Generated', Value: new Date().toLocaleString('en-IN') }
  ]), 'Info');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${fileName}.xlsx`);
};
