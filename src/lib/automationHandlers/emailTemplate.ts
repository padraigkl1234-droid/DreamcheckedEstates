import { DREAMLAND_YELLOW_HEX } from '@/lib/brandMark';

// Invictus-branded HTML email bodies, shared by every automation handler.
// Table-based layout throughout since that's what renders reliably across
// Gmail/Outlook/etc., unlike flexbox/grid.

export interface ReportRow {
  name: string;
  meta: string; // right-hand column text, e.g. a date or an overdue status
  category: string;
  /** Renders `meta` in red/bold — used for overdue rows. */
  highlight?: boolean;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bannerAndFooter(bodyHtml: string): string {
  // The Dreamland wordmark, set in type rather than as an image: mail clients
  // routinely block remote images, and an inlined one would bloat every send.
  // The banner is dark, so the logo keeps its own white and yellow with no
  // pink field behind it.
  return `
<div style="background:#eeeeee;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e2e2;">
    <tr>
      <td align="center" style="background:#111114;padding:22px 28px 18px;">
        <div style="font-size:22px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#ffffff;line-height:1;">Dreamland</div>
        <div style="margin-top:6px;font-size:9px;font-weight:700;letter-spacing:.52em;text-transform:uppercase;color:${DREAMLAND_YELLOW_HEX};line-height:1;">Margate</div>
      </td>
    </tr>
    ${bodyHtml}
    <tr>
      <td style="padding:16px 28px 24px;">
        <p style="margin:0;font-size:11px;color:#a0a0a0;">Sent automatically by Invictus automations.</p>
      </td>
    </tr>
  </table>
</div>`;
}

export function reportTableEmail({
  heading,
  subheading,
  columnLabel,
  rows,
}: {
  heading: string;
  subheading: string;
  columnLabel: string;
  rows: ReportRow[];
}): string {
  const rowsHtml = rows
    .map(
      (r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f7f7f8'};">
        <td style="padding:10px 16px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #ececec;">${escapeHtml(r.name)}</td>
        <td style="padding:10px 16px;font-size:12px;font-weight:${r.highlight ? 600 : 400};color:${r.highlight ? '#c0272d' : '#6b6b6b'};border-bottom:1px solid #ececec;white-space:nowrap;">${escapeHtml(r.meta)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #ececec;">
          ${
            r.category
              ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fdeceb;color:#c0272d;font-weight:600;font-size:10px;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(r.category)}</span>`
              : '<span style="color:#c7c7c7;font-size:12px;">—</span>'
          }
        </td>
      </tr>`
    )
    .join('');

  return bannerAndFooter(`
    <tr>
      <td style="padding:24px 28px 4px;">
        <h1 style="margin:0;font-size:18px;color:#111114;">${escapeHtml(heading)}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#6b6b6b;">${escapeHtml(subheading)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">Task</th>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">${escapeHtml(columnLabel)}</th>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">Group</th>
          </tr>
          ${rowsHtml}
        </table>
      </td>
    </tr>`);
}

export function announcementEmail({ eyebrow, heading, subheading }: { eyebrow: string; heading: string; subheading: string }): string {
  return bannerAndFooter(`
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#c0272d;font-weight:700;">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 8px;font-size:20px;color:#111114;">${escapeHtml(heading)}</h1>
        <p style="margin:0;font-size:14px;color:#6b6b6b;">${escapeHtml(subheading)}</p>
      </td>
    </tr>`);
}
