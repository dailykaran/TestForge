import { nativeImage } from 'electron';

// Create a simple 256x256 icon from the updated TF SVG mark.
export function getAppIcon() {
  // Always create the icon from the updated SVG data URL so the new TF mark is used.
  const svgData = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="50" fill="url(#bgGradient)"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="80" font-weight="800" letter-spacing="-4" fill="#FFFFFF">TF</text>
    </svg>
  `;

  const base64 = Buffer.from(svgData).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  
  try {
    return nativeImage.createFromDataURL(dataUrl);
  } catch (error) {
    console.error('Failed to create icon:', error);
    return undefined;
  }
}
