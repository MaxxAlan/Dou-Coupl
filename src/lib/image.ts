// Image processing helpers for resizing and compressing images before E2EE encryption and upload.

export type PhotoFilter =
  | 'normal'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'dramatic'
  | 'soft';

export interface FilterPreset {
  id: PhotoFilter;
  label: string;
  cssFilter: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'normal',    label: 'Gốc',     cssFilter: 'none' },
  { id: 'grayscale', label: 'Đen trắng', cssFilter: 'grayscale(1)' },
  { id: 'sepia',     label: 'Sepia',    cssFilter: 'sepia(0.7) contrast(1.1)' },
  { id: 'warm',      label: 'Ấm áp',   cssFilter: 'sepia(0.3) saturate(1.3) hue-rotate(-10deg)' },
  { id: 'cool',      label: 'Mát mẻ',   cssFilter: 'saturate(0.9) hue-rotate(30deg) brightness(1.05)' },
  { id: 'vintage',   label: 'Cổ điển',  cssFilter: 'sepia(0.5) contrast(0.85) brightness(1.1) saturate(0.7)' },
  { id: 'dramatic',  label: 'Mạnh',     cssFilter: 'contrast(1.4) saturate(1.2) brightness(0.9)' },
  { id: 'soft',      label: 'Nhẹ nhàng', cssFilter: 'brightness(1.1) contrast(0.9) saturate(0.8) blur(0.3px)' },
];

export async function compressAndResizeImage(base64Str: string, maxDim = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's not a data URI base64 string, resolve as-is
    if (!base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    const img = new globalThis.Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedBase64);
    };
    img.onerror = (err) => {
      console.warn('Failed to load image for compression, using fallback', err);
      resolve(base64Str);
    };
  });
}

export async function applyFilterToImage(base64Str: string, filterId: PhotoFilter, quality = 0.92): Promise<string> {
  if (filterId === 'normal') return base64Str;

  const preset = FILTER_PRESETS.find(f => f.id === filterId);
  if (!preset) return base64Str;

  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      ctx.filter = preset.cssFilter;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      resolve(canvas.toDataURL('image/png', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
}

export function downloadAsPng(base64Str: string, filename = 'photo.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
