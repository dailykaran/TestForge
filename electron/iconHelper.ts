import { nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

// Create a simple 256x256 PNG programmatically
export function getAppIcon() {
  const iconsDir = path.join(process.cwd(), 'public', 'icons');
  
  // Try to use existing PNG
  const pngPath = path.join(iconsDir, 'icon-256x256.png');
  if (fs.existsSync(pngPath)) {
    console.log('Using existing PNG icon:', pngPath);
    return nativeImage.createFromPath(pngPath);
  }

  // Fallback: Create icon from SVG data URL
  const svgData = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1D4ED8;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="50" fill="url(#bgGradient)"/>
      <g>
        <rect x="45" y="65" width="110" height="80" rx="12" fill="#FFFFFF" opacity="0.95"/>
        <circle cx="85" cy="105" r="26" fill="none" stroke="#FFFFFF" stroke-width="3"/>
        <circle cx="85" cy="105" r="20" fill="none" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="85" cy="105" r="14" fill="#3B82F6" opacity="0.3"/>
        <circle cx="85" cy="105" r="8" fill="#FFFFFF"/>
        <rect x="130" y="75" width="20" height="60" rx="10" fill="#FFFFFF" opacity="0.9" stroke="#3B82F6" stroke-width="2"/>
        <circle cx="155" cy="60" r="7" fill="#EF4444"/>
      </g>
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
