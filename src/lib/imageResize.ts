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

export async function downscaleImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  // GIFs would lose their animation, SVGs aren't raster — leave both alone.
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    // Already small, and not a needlessly heavy file — nothing worth doing.
    if (scale === 1 && file.size < 1_000_000) return file;

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    // If re-encoding didn't actually help, keep the original.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
