// Pulling photos back out of Storage so they can be embedded in a PDF.
//
// Shared by the archived-task export and the report export. A photo that
// won't come down — the bucket's CORS rules, an offline phone, a format
// jsPDF can't decode — must never cost you the whole document, so every
// failure is counted and reported rather than thrown.

export type PdfPhoto = { dataUrl: string; format: 'JPEG' | 'PNG'; w: number; h: number };

/** Just enough of jsPDF to measure an image, so this file needn't import it. */
type ImageSizer = { getImageProperties: (dataUrl: string) => { width: number; height: number } };

/** Fetch one image as a data URL. Returns null on anything jsPDF can't place. */
export async function fetchPhotoForPdf(
  url: string
): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format = blob.type === 'image/png' ? 'PNG' : blob.type === 'image/jpeg' ? 'JPEG' : null;
    if (!format) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}

/**
 * Fetch a batch of photos and measure each one, ready to be placed.
 *
 * Downloads run together rather than one after another: a walk-round with
 * twenty photos on it would otherwise sit there for most of a minute before
 * the first mark reached the page.
 */
export async function loadPhotosForPdf(
  sizer: ImageSizer,
  urls: string[]
): Promise<{ photos: PdfPhoto[]; missing: number }> {
  const got = await Promise.all(urls.map((u) => fetchPhotoForPdf(u)));
  const photos: PdfPhoto[] = [];
  let missing = 0;
  for (const g of got) {
    if (!g) {
      missing++;
      continue;
    }
    try {
      const props = sizer.getImageProperties(g.dataUrl);
      photos.push({ ...g, w: props.width, h: props.height });
    } catch {
      missing++;
    }
  }
  return { photos, missing };
}

/**
 * Lay a set of photos out across the page width, `perRow` to a row, scaled to
 * fit their column and never taller than `maxH`.
 *
 * Starts at `startY` and returns the y below the last row, so the caller can
 * carry on underneath. `ensureRoom(needed, at)` is asked, before each row is
 * drawn, where that row may actually go: it returns `at` if the row fits, or
 * the top of a fresh page if the caller broke one. Keeping the position in
 * the return value rather than in shared state is what stops the second row
 * landing on top of the first.
 */
export function drawPhotoGrid(
  doc: { addImage: (d: string, f: string, x: number, y: number, w: number, h: number) => void },
  photos: PdfPhoto[],
  opts: {
    left: number;
    contentW: number;
    startY: number;
    perRow: number;
    maxH: number;
    gap: number;
    ensureRoom: (needed: number, at: number) => number;
  }
): number {
  const { left, contentW, startY, perRow, maxH, gap, ensureRoom } = opts;
  const colW = (contentW - gap * (perRow - 1)) / perRow;
  let y = startY;
  for (let i = 0; i < photos.length; i += perRow) {
    const sized = photos.slice(i, i + perRow).map((p) => {
      const scale = Math.min(colW / p.w, maxH / p.h);
      return { ...p, dw: p.w * scale, dh: p.h * scale };
    });
    const rowH = Math.max(...sized.map((s) => s.dh));
    // Break on the taller of the row, so an image can never be clipped by
    // the page edge.
    y = ensureRoom(rowH, y);
    sized.forEach((s, k) => doc.addImage(s.dataUrl, s.format, left + k * (colW + gap), y, s.dw, s.dh));
    y += rowH + gap;
  }
  return y;
}
