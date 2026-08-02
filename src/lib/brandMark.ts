// The Dreamland Margate wordmark, for documents that go outside the app —
// exported PDFs and automated emails.
//
// The logo is white "DREAMLAND" over yellow "MARGATE" on a pink field. Dropped
// onto white paper the white type would vanish, so on light backgrounds the
// mark is drawn in the brand pink with the sub-line in a darkened gold (pure
// yellow on white is unreadable). On the dark email banner the original white
// and yellow are used as-is. Either way there's no pink block behind it.

export const DREAMLAND_PINK: [number, number, number] = [244, 58, 166];
/** The logo's yellow, darkened enough to stay legible on white. */
export const DREAMLAND_GOLD_ON_LIGHT: [number, number, number] = [191, 140, 0];
/** The logo's yellow as-is, for dark backgrounds. */
export const DREAMLAND_YELLOW_HEX = '#ffd84d';
export const DREAMLAND_PINK_HEX = '#f43aa6';

// Only the handful of jsPDF methods the wordmark needs — avoids pulling the
// jsPDF types into modules that merely want to draw the logo.
interface PdfLike {
  setFont(family: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  text(text: string, x: number, y: number, options?: { charSpace?: number }): unknown;
  getTextWidth(text: string): number;
}

/**
 * Draws the wordmark with `y` as the baseline of "DREAMLAND".
 * Returns the y a caller should continue below.
 */
export function drawDreamlandWordmark(doc: PdfLike, x: number, y: number, size = 20): number {
  const track = size * 0.16; // the logo's wide letter-spacing
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...DREAMLAND_PINK);
  doc.text('DREAMLAND', x, y, { charSpace: track });
  const mainWidth = doc.getTextWidth('DREAMLAND') + track * 'DREAMLAND'.length;

  const subSize = size * 0.34;
  const subTrack = subSize * 0.6;
  doc.setFontSize(subSize); // set before measuring — getTextWidth uses the current size
  doc.setTextColor(...DREAMLAND_GOLD_ON_LIGHT);
  const subWidth = doc.getTextWidth('MARGATE') + subTrack * 'MARGATE'.length;
  const subBaseline = y + subSize * 1.8;
  // Centred under the main word, as in the logo.
  doc.text('MARGATE', x + Math.max(0, (mainWidth - subWidth) / 2), subBaseline, { charSpace: subTrack });

  return subBaseline;
}
