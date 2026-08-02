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

/** Invictus is the tool, not the brand — drawn in grey so it stays secondary
 * to the Dreamland mark. */
const INVICTUS_GREY: [number, number, number] = [125, 125, 125];

// Only the handful of jsPDF methods these marks need — avoids pulling the
// jsPDF types into modules that merely want to draw the logo.
interface PdfLike {
  setFont(family: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  text(text: string, x: number, y: number, options?: { charSpace?: number; align?: string }): unknown;
  getTextWidth(text: string): number;
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string): unknown;
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

// The Invictus pinwheel, redrawn as vectors from the same geometry as the
// on-screen icon (src/components/icons/Pinwheel.tsx) so the two stay identical.
const BLADES = 8;
const ICON_BOX = 24; // the icon's viewBox, which the geometry below is in
const INNER_R = 2.4;
const OUTER_R = 10.6;
const HALF_WIDTH_DEG = 13;
const TWIST_DEG = 18;

function drawPinwheel(doc: PdfLike, cx: number, cy: number, size: number, colour: [number, number, number]) {
  const scale = size / ICON_BOX;
  const at = (radius: number, deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * scale * Math.sin(rad), cy - radius * scale * Math.cos(rad)];
  };
  doc.setFillColor(...colour);
  for (let i = 0; i < BLADES; i++) {
    const centre = (360 / BLADES) * i;
    const [ix, iy] = at(INNER_R, centre - TWIST_DEG);
    const [ax, ay] = at(OUTER_R, centre - HALF_WIDTH_DEG);
    const [bx, by] = at(OUTER_R, centre + HALF_WIDTH_DEG);
    doc.triangle(ix, iy, ax, ay, bx, by, 'F');
  }
}

/** The Invictus pinwheel and wordmark, tucked into the top-right corner. */
export function drawInvictusCorner(doc: PdfLike, rightEdge: number, y: number, size = 13) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INVICTUS_GREY);
  const track = 1.4;
  const label = 'INVICTUS';
  const labelWidth = doc.getTextWidth(label) + track * label.length;
  doc.text(label, rightEdge - labelWidth, y, { charSpace: track });
  // Sits left of the wordmark, centred on its cap height.
  drawPinwheel(doc, rightEdge - labelWidth - size / 2 - 5, y - size * 0.28, size, INVICTUS_GREY);
}

/** Small attribution line along the foot of a page. */
export function drawInvictusFooter(doc: PdfLike, leftEdge: number, rightEdge: number, y: number, when = new Date()) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text('INVICTUS', leftEdge, y, { charSpace: 0.8 });
  doc.text(
    `${when.toLocaleDateString('en-GB')} · ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    rightEdge,
    y,
    { align: 'right' }
  );
}
