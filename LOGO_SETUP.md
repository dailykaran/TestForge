# 🎨 Logo Setup Guide - TestForge

Your new **Logo-Option-3** (Code + Play design) has been integrated into your Electron app!

## ✅ What's Done

1. ✓ Logo SVG created at `public/icons/icon.svg`
2. ✓ Updated `main.ts` to use PNG icon (cross-platform compatible)
3. ✓ Updated `index.html` to use new favicon
4. ✓ Created icon generation script at `scripts/generate-icons.mjs`

## 🚀 Next Steps

### Option 1: Automatic Icon Generation (Recommended)

Install `sharp` (image processing library):
```bash
npm install --save-dev sharp
```

Then generate all icon sizes:
```bash
npm run generate-icons
```

This will create:
- `icon-16x16.png` (taskbar, system tray)
- `icon-32x32.png` (smaller displays)
- `icon-64x64.png` (standard small)
- `icon-128x128.png` (medium)
- `icon-256x256.png` (app window icon)
- `icon-512x512.png` (high-res, app stores)
- `favicon.png` (browser tab)

### Option 2: Manual Online Conversion

If you prefer not to install dependencies:

1. Go to: **https://convertio.co/svg-png/**
2. Upload: `public/icons/icon.svg`
3. Convert to PNG at size: **256x256**
4. Download and save as: `public/icons/icon-256x256.png`

For favicon:
1. Do the same conversion at size: **32x32**
2. Save as: `public/icons/favicon.png`

### Option 3: Use Web-Based Tool

Visit: **https://icoconvert.com/** to convert PNG → ICO (Windows-specific)

## 📁 File Structure

```
public/icons/
├── icon.svg                 ← Source vector file
├── icon-16x16.png          ← Generated (taskbar)
├── icon-32x32.png          ← Generated (small icon)
├── icon-64x64.png          ← Generated (medium icon)
├── icon-128x128.png        ← Generated (medium-large)
├── icon-256x256.png        ← Generated (main app icon)
├── icon-512x512.png        ← Generated (high-res)
└── favicon.png             ← Generated (browser tab)
```

## 🔧 Configuration

Your app is already configured to:
- Load `icon-256x256.png` as the window icon
- Load `icon.svg` as the favicon
- Gracefully handle missing icons (won't crash)

## 💡 Tips

- **SVG is scalable** → Perfect for any size needed
- **PNG is cross-platform** → Works on Windows, Mac, Linux
- **Favicon caching** → Clear browser cache if favicon doesn't update

## 🎯 Color Reference

The logo uses your brand colors:
- **Dark Blue**: `#1E3A8A` → `#1E40AF` (gradient)
- **Cyan Accent**: `#00D9FF`
- **White**: `#FFFFFF`

## ✨ Next Build

When you build your app:
```bash
npm run build
```

The icons will be automatically packaged with your application!

---

**Need help?** Check the repo memory or contact your development team.
