/**
 * imageUtils.js — Centralized image utilities and fallback placeholders
 * Prevents broken image icons across all client, trainer, and gallery views.
 */

// Sleek circular profile avatar silhouette SVG (data URI)
export const DEFAULT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="80" fill="url(#bgGrad)"/>
  <circle cx="80" cy="62" r="28" fill="#94a3b8"/>
  <path d="M36 136c0-24.3 19.7-44 44-44s44 19.7 44 44v4H36v-4z" fill="#94a3b8"/>
</svg>
`)}`;

// Modern dark-themed Olympia Fitness gallery card placeholder (data URI)
export const DEFAULT_GALLERY_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="gGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" rx="12" fill="url(#gGrad)"/>
  <rect x="2" y="2" width="596" height="396" rx="10" fill="none" stroke="#334155" stroke-width="2"/>
  <circle cx="300" cy="165" r="48" fill="#1e293b" stroke="url(#accent)" stroke-width="2.5"/>
  <path d="M280 178l14-18 12 14 8-10 16 17h-50z" fill="url(#accent)"/>
  <circle cx="288" cy="150" r="5" fill="#facc15"/>
  <text x="300" y="250" text-anchor="middle" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">OLYMPIA FITNESS</text>
  <text x="300" y="275" text-anchor="middle" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500">Gallery Image</text>
</svg>
`)}`;

/**
 * Higher-order event handler for <img onError={...} />
 * Sets the image src to a clean SVG fallback without infinite error loops.
 * 
 * @param {'avatar' | 'gallery'} type 
 * @returns {(e: React.SyntheticEvent<HTMLImageElement, Event>) => void}
 */
export const handleImageError = (type = 'avatar') => (e) => {
  if (!e || !e.currentTarget) return;
  e.currentTarget.onerror = null;
  e.currentTarget.src = type === 'gallery' ? DEFAULT_GALLERY_IMAGE : DEFAULT_AVATAR;
};

/**
 * Compresses an image File using an HTML canvas and returns a base64 Data URL.
 * Ensures uploaded photos are compact (~30KB-80KB) and load rapidly.
 * 
 * @param {File} file
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @param {number} quality
 * @returns {Promise<string|null>}
 */
export const compressImageFile = (file, maxWidth = 600, maxHeight = 600, quality = 0.8) => {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (err) {
          resolve(readerEvent.target.result);
        }
      };
      img.onerror = () => {
        resolve(readerEvent.target.result);
      };
      img.src = readerEvent.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};
