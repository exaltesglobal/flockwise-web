// Photos taken in the office: shrunk in the browser before they go anywhere.

/** Shrinks a photo to a JPEG (longest side `max` px) and returns it as base64 with a data: preview. */
export async function shrinkPhoto(file: File, max = 1600, quality = 0.82): Promise<{ mediaType: string; data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bad image')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const preview = c.toDataURL('image/jpeg', quality);
    return { mediaType: 'image/jpeg', data: preview.slice(preview.indexOf(',') + 1), preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}
