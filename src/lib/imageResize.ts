// Photos off a phone arrive 3–4000px wide and several megabytes. Shown as
// small thumbnails, the browser has to decode and rescale that full bitmap
// every time it paints — which is what makes a list of them judder as you
// scroll past. Shrinking on the way in fixes it at the source, and cuts
// upload time, storage and mobile data with it (this lot are usually out on
// the park, on a phone).
//
// Deliberately forgiving: anything that isn't a resizable raster image, or
// that fails to decode, passes straight through untouched. An upload should
// never fail because the resize did.

/** Longest edge, in pixels, a stored photo is allowed to keep. Comfortably
 *  more than any thumbnail or lightbox needs, while cutting a 12MP phone
 *  photo to a few hundred KB. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/** Longest edge for the separate thumbnail stored alongside a photo. The
 *  rows show photos in an 80px box, so 320px stays sharp even on a 3x phone
 *  screen while costing the GPU roughly a twenty-fifth of the full image's
 *  texture. That difference is the whole point: a decoded 1600px photo is
 *  ~10MB of bitmap, and a handful of them in a scrolling list is enough to
 *  push a phone past its frame budget. */
const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.8;

/** Cache headers for anything we upload. Storage paths include a timestamp
 *  and are never rewritten, so the bytes at a given path can safely be
 *  treated as immutable — which keeps the browser from re-requesting a photo
 *  it already has while you're scrolling past it. */
export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function resizableRaster(file: File): boolean {
  // GIFs would lose their animation, SVGs aren't raster — leave both alone.
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return false;
  return typeof document !== 'undefined' && typeof createImageBitmap === 'function';
}

/** Re-encode `file` so its longest edge is at most `maxEdge`. Returns null if
 *  that isn't possible (not a raster image, decode failed, no canvas). */
async function reencode(file: File, maxEdge: number, quality: number): Promise<{ file: File; scaled: boolean } | null> {
  if (!resizableRaster(file)) return null;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    return {
      file: new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }),
      scaled: scale < 1,
    };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export async function downscaleImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  const out = await reencode(file, maxEdge, JPEG_QUALITY);
  if (!out) return file;
  // If the source was oversized, always take the resized copy — a 4000px
  // bitmap is expensive to paint however few bytes it happens to weigh, and
  // judging this on file size alone was letting big photos through.
  if (out.scaled) return out.file;
  // Same dimensions either way, so only swap if it genuinely saves bytes.
  return out.file.size < file.size ? out.file : file;
}

/** A small companion image for list thumbnails. Null when one can't be made,
 *  in which case callers should fall back to the full-size photo. */
export async function makeThumbnail(file: File, maxEdge = THUMB_EDGE): Promise<File | null> {
  const out = await reencode(file, maxEdge, THUMB_QUALITY);
  return out?.file ?? null;
}
