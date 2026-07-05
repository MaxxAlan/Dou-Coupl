// Image processing helpers for resizing and compressing images before E2EE encryption and upload.

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
