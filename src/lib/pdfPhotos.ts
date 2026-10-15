// Pulling photos back out of Storage so they can be embedded in a PDF.
//
// Shared by the archived-task export and the report export. A photo that
// won't come down — the bucket's CORS rules, an offline phone, a format
// jsPDF can't decode — must never cost you the whole document, so every
// failure is counted and reported rather than thrown.

export type PdfPhoto = { dataUrl: string; format: 'JPEG' | 'PNG'; w: number; h: number };

/** Just enough of jsPDF to measure an image, so this file needn't import it. */
type ImageSizer = { getImageProperties: (dataUrl: string) => { width: number; height: number } };

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Turn downloaded bytes into something jsPDF will place.
 *
 * jsPDF only decodes JPEG and PNG, but what comes back is not always one of
 * those: a HEIC straight off an iPhone survives upload untouched whenever the
 * browser can't re-encode it, and Storage serves application/octet-stream for
 * anything uploaded without a content type. Those were being dropped on the
 * floor. Anything the browser itself can decode is now re-encoded to JPEG
 * through a canvas instead.
 */
async function toPlaceableImage(blob: Blob): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
    return { dataUrl: await readAsDataUrl(blob), format: blob.type === 'image/png' ? 'PNG' : 'JPEG' };
  }
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), format: 'JPEG' };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Fetch one image as a data URL. Returns null on anything jsPDF can't place. */
export async function fetchPhotoForPdf(
  url: string
): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  // Three ways to get at the bytes, cheapest first.
  //
  // "direct" is a plain cross-origin fetch, which is subject to CORS even
  // though the same photo displays fine in an <img>. "reload" repeats it past
  // the HTTP cache, because these photos are shown on the page first and
  // stored immutable for a year, and a cached no-cors response cannot satisfy
  // a cors-mode fetch of the same URL. "proxy" reads it through our own
  // origin, where CORS doesn't apply at all — slower, and the one that works
  // whatever the bucket says.
  const attempts: [string, () => Promise<Response>][] = [
    ['direct', () => fetch(url)],
    ['reload', () => fetch(url, { cache: 'reload' })],
    ['proxy', () => fetch(`/api/report-photo?url=${encodeURIComponent(url)}`)],
  ];

  for (const [how, go] of attempts) {
    try {
      const res = await go();
      if (!res.ok) {
        console.warn(`[pdf] photo ${how} returned ${res.status}`, url);
        continue;
      }
      const blob = await res.blob();
      const placeable = await toPlaceableImage(blob);
      if (placeable) return placeable;
      // It downloaded; another route would fetch the same undecodable bytes.
      console.warn(`[pdf] photo could not be decoded (type "${blob.type}")`, url);
      return null;
    } catch (err) {
      console.warn(`[pdf] photo ${how} failed`, url, err);
    }
  }
  return null;
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
    } catch (err) {
      // Logged, not swallowed: a photo that downloads and then can't be
      // measured looks identical in the finished PDF to one that never
      // arrived, and the two have nothing to do with each other.
      console.warn('[pdf] photo downloaded but could not be measured', err);
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
