import { useEffect } from 'react';
import { useBackgroundStore } from '../store/backgroundStore';

/** localStorage is ~5 MB per origin and appStore shares it; stay well under. */
const MAX_DATA_URL_CHARS = 2_500_000;

/**
 * Decode an image file and re-encode it as a downscaled JPEG data URL, small
 * enough to live in localStorage. Shrinks further until it fits the budget.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const [maxDim, quality] of [[1920, 0.82], [1600, 0.76], [1280, 0.7], [1024, 0.6]] as const) {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= MAX_DATA_URL_CHARS) return url;
    }
    throw new Error('Image is too large to store');
  } finally {
    bitmap.close();
  }
}

/** Mirror the background store onto <html>: the CSS in index.css does the rest. */
export function useBackgroundSync(): void {
  const glass = useBackgroundStore((s) => s.glass);
  const image = useBackgroundStore((s) => s.image);
  const dim = useBackgroundStore((s) => s.dim);
  const blur = useBackgroundStore((s) => s.blur);
  const panelOpacity = useBackgroundStore((s) => s.panelOpacity);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-glass', glass ? 'on' : 'off');
    root.style.setProperty('--bg-dim', String(dim));
    root.style.setProperty('--bg-blur', `${blur}px`);
    root.style.setProperty('--glass-alpha', String(panelOpacity));
    if (image) root.style.setProperty('--app-bg-image', `url("${image}")`);
    else root.style.removeProperty('--app-bg-image');
  }, [glass, image, dim, blur, panelOpacity]);
}
