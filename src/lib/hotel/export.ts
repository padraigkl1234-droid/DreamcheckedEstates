'use client';

// Hotel exports: CSV and PDF, using the same jsPDF + autotable tooling and
// INVICTUS corner/footer marks as the rest of the app's reports.

import { drawInvictusCorner, drawInvictusFooter } from '@/lib/brandMark';

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? '' : String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  // BOM so Excel opens UTF-8 (°C, names) correctly.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PdfSection {
  title?: string;
  /** Plain lines shown above the table (key facts). */
  lines?: string[];
  head?: string[];
  body?: (string | number)[][];
  /** Row indexes to colour red (e.g. failed checks). */
  alertRows?: number[];
}

/** A simple branded A4 report: hotel name, title, subtitle, then sections. */
export async function exportPdf(opts: { filename: string; hotel: string; title: string; subtitle?: string; sections: PdfSection[] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const accent: [number, number, number] = [57, 53, 47];
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const footer = () => drawInvictusFooter(pdf, 40, pageW - 40, pageH - 30);

  drawInvictusCorner(pdf, pageW - 40, 46);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(120, 120, 120);
  pdf.text(opts.hotel.toUpperCase(), 40, 50, { charSpace: 1 });
  pdf.setFontSize(18);
  pdf.setTextColor(...accent);
  pdf.text(opts.title, 40, 78);
  let y = 78;
  if (opts.subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(opts.subtitle, 40, y + 18);
    y += 18;
  }
  y += 16;

  for (const section of opts.sections) {
    if (y > pageH - 120) {
      footer();
      pdf.addPage();
      y = 50;
    }
    if (section.title) {
      y += 14;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(30, 30, 30);
      pdf.text(section.title, 40, y);
      y += 6;
    }
    if (section.lines?.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(60, 60, 60);
      for (const line of section.lines) {
        y += 14;
        pdf.text(line, 40, y);
      }
      y += 4;
    }
    if (section.head && section.body) {
      const alert = new Set(section.alertRows ?? []);
      autoTable(pdf, {
        startY: y + 6,
        head: [section.head],
        body: section.body.length ? section.body.map((r) => r.map(String)) : [[{ content: 'Nothing to show', colSpan: section.head.length }] as never],
        headStyles: { fillColor: accent, textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data) => {
          if (data.section === 'body' && alert.has(data.row.index)) data.cell.styles.textColor = [176, 32, 40];
        },
        margin: { left: 40, right: 40, bottom: 56 },
        didDrawPage: footer,
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }
  footer();
  pdf.save(opts.filename);
}
