# TestForge EXE Build Guide

## Overview

This guide provides step-by-step instructions for building and creating executable files (EXE) for the TestForge application on Windows. TestForge is an Electron-based desktop application that records user interactions and generates AI-powered QA test cases.

### Build Output Types

- **NSIS Installer** (`TF Setup.exe`) - Full installer package for end-users
- **Portable EXE** (`TF.exe`) - Standalone executable that runs without installation

---

## Prerequisites

### System Requirements

- **Operating System:** Windows 10 or higher
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **Disk Space:** ~2-3 GB (for dependencies, build artifacts, and final executables)

### Software Installation

#### 1. Install Node.js and npm

1. Visit [nodejs.org](https://nodejs.org/)
2. Download the LTS (Long Term Support) version
3. Run the installer and follow the setup wizard
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

#### 2. Visual Studio Build Tools (Required for Native Modules)

TestForge includes native modules (`uiohook-napi`, `screenshot-desktop`) that require compilation.

1. Download [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/)
2. Run the installer
3. Select "Desktop development with C++" workload
4. Complete installation (~3-5 GB)

> **Alternative:** If you have Visual Studio Community 2022 or Professional already installed, the build tools are included.

#### 3. Python 3.11+ (Required for Node-gyp)

Some native modules require Python for compilation:

1. Download [Python 3.11+](https://www.python.org/downloads/)
2. During installation, check "Add Python to PATH"
3. Verify installation:
   ```bash
   python --version
   ```

#### 4. Required Icon File

Ensure `public/icons/icon.ico` exists in your project. This is required for Windows builds.

- If missing, create from PNG using an ICO converter
- Icon should be 512x512 pixels or larger

---

## Build Configuration

### Current Configuration (electron-builder.config.js)

```javascript
module.exports = {
  appId: 'com.testforge.app',
  productName: 'TF',
  directories: { output: 'dist-electron' },
  win: { target: 'nsis', icon: 'public/icons/icon.ico' },
  mac: { target: 'dmg', icon: 'public/icons/icon.icns' },
  linux: { target: 'AppImage' },
  extraResources: ['resources/**'],
};
```

### Configuration for Both Installer and Portable EXE

To generate both NSIS installer and portable EXE, modify `electron-builder.config.js`:

**Change this line:**
```javascript
win: { target: 'nsis', icon: 'public/icons/icon.ico' },
```

**To this:**
```javascript
win: { target: ['nsis', 'portable'], icon: 'public/icons/icon.ico' },
```

This tells electron-builder to generate both build types in a single build process.

---

## Step-by-Step Build Process

### Phase 1: Project Setup

#### Step 1: Open Terminal/Command Prompt

Navigate to the TestForge project directory:

```bash
cd d:\Dinakaran_Files\AITestcaseGeneration\testcase-recorder
```

#### Step 2: Install Dependencies

Install all required npm packages:

```bash
npm install
```

**What happens:**
- Downloads ~1,500+ npm packages
- Compiles native modules (uiohook-napi, screenshot-desktop)
- Sets up Vite, Electron, and electron-builder
- Duration: 5-15 minutes (depending on internet speed and system performance)

**If npm install fails:**
- Ensure Visual Studio Build Tools and Python are installed
- Try clearing npm cache: `npm cache clean --force`
- Try installing with build tools: `npm install --build-from-source`

#### Step 3: Verify Icon File

Check that the icon file exists:

```bash
dir public\icons\icon.ico
```

**Expected output:** The file size and last modified date (typically 100-500 KB)

---

### Phase 2: Build TypeScript and Bundle Assets

#### Step 4: Run Production Build

Compile TypeScript and bundle React + Electron:

```bash
npm run build
```

**What happens:**
- TypeScript compilation (`tsc -b`)
  - Validates all TypeScript syntax and types
  - Generates `dist-electron/` directory with compiled JavaScript
  - Generates type definitions
- Vite bundling (`vite build`)
  - Bundles React frontend → `dist/` folder
  - Bundles Electron main process → `dist-electron/main.js`
  - Bundles preload script → `dist-electron/preload.js`
  - Minifies and optimizes code for production
- Duration: 1-3 minutes

**Expected output:**
```
dist/
├── index.html
├── assets/
│   ├── index-*.js
│   └── index-*.css

dist-electron/
├── main.js
└── preload.js
```

**If build fails:**
- Check console output for TypeScript errors
- Fix errors in source code (electron/ and src/ folders)
- Re-run `npm run build`

#### Step 5: Verify Build Outputs

Confirm all output files exist:

```bash
# Check React build
dir dist

# Check Electron build
dir dist-electron
```

**Files should exist:**
- `dist/index.html`
- `dist/assets/` (contains bundled JS/CSS)
- `dist-electron/main.js`
- `dist-electron/preload.js`

---

### Phase 3: Generate EXE Files

#### Step 6: Run Electron-Builder

Create the executable files:

```bash
npx electron-builder --win portable nsis
```

Or if you prefer a shorter syntax:

```bash
npx electron-builder --win
```

**What happens:**
- Reads the built files from `dist/` and `dist-electron/`
- Packages them into Windows executables
- Creates NSIS installer executable
- Creates portable standalone executable
- Signs files if code signing is configured (skipped in dev builds)
- Stores outputs in `dist-electron/` folder
- Duration: 2-5 minutes

**Expected console output:**
```
electron-builder 26.8.1
  building       target=nsis arch=x64 on windows
  building       target=portable arch=x64 on windows
  ✓ built
```

---

### Phase 4: Verify Executables

#### Step 7: Check Generated Files

Navigate to the output directory:

```bash
dir dist-electron
```

**You should see both files:**
- `TF Setup.exe` (~150-200 MB) - NSIS installer
- `TF.exe` (~150-200 MB) - Portable executable

**Check file timestamps:** Both should be created within the last few minutes.

#### Step 8: Test Portable EXE (Recommended)

Run the portable version to verify it works:

```bash
# From terminal or file explorer
dist-electron\TF.exe
```

**Expected behavior:**
1. Application window opens
2. No error messages in console
3. All UI elements load correctly
4. Resources and assets display properly
5. Settings page loads with API configuration options

**To close:** Click the application close button or press Alt+F4

#### Step 9: Test NSIS Installer (Recommended)

Run the installer to verify installation process:

```bash
dist-electron\TF Setup.exe
```

**Expected behavior:**
1. Windows SmartScreen warning appears (expected for unsigned apps - click "More info" → "Run anyway")
2. NSIS installer wizard opens
3. Shows:
   - Welcome screen
   - License agreement
   - Installation location (default: `C:\Users\<user>\AppData\Local\Programs\TF`)
   - Start menu folder selection
   - Installation progress
   - Completion screen with option to launch app
4. Optionally launch app after installation
5. Verify app launches correctly

**To uninstall:** 
- Go to Settings → Apps & Features
- Find "TF"
- Click Uninstall
- Follow prompts

---

## Build Directory Structure

After a successful build, your project structure will include:

```
project-root/
├── dist/                              # React frontend build output
│   ├── index.html                    # Entry HTML
│   ├── assets/                       # Bundled JS/CSS
│   └── icons/                        # Static icons
│
├── dist-electron/                     # Electron build output
│   ├── main.js                       # Compiled main process
│   ├── preload.js                    # Compiled preload script
│   ├── TF Setup.exe                  # ✅ NSIS Installer (150-200 MB)
│   ├── TF.exe                        # ✅ Portable Executable (150-200 MB)
│   ├── builder-effective-config.yaml # Build config snapshot
│   └── (other temp files)
│
└── [source files unchanged]
```

---

## Troubleshooting

### Problem: npm install fails

**Error:** `gyp ERR! build error` or `Cannot find module 'node-gyp'`

**Solution:**
1. Install Visual Studio Build Tools 2022
2. Install Python 3.11+
3. Run: `npm install --build-from-source`

---

### Problem: npm run build produces TypeScript errors

**Error:** `error TS####: ...`

**Solution:**
1. Review the error message
2. Fix the TypeScript issue in source code (electron/ or src/ folder)
3. Re-run: `npm run build`

Example TypeScript error:
```
src/pages/Dashboard.tsx:45 - error TS2322: Type 'string' is not assignable to type 'number'
```
Fix the type error in the code and retry.

---

### Problem: electron-builder command not found

**Error:** `'npx' is not recognized` or `electron-builder not found`

**Solution:**
1. Ensure npm is installed: `npm --version`
2. Ensure you're in the correct project directory
3. Run: `npm install electron-builder --save-dev`
4. Try: `npx electron-builder --win` again

---

### Problem: EXE files too small or missing files

**Error:** Generated `TF.exe` is only 50 MB or doesn't run properly

**Solution:**
1. Verify `npm run build` completed without errors
2. Check that `dist-electron/main.js` exists and is not empty (~100+ KB)
3. Check that `dist/` folder contains bundled assets
4. Run: `npm run build` again and check file sizes

---

### Problem: Icon not appearing in installer/EXE

**Error:** Installer uses default Windows icon instead of custom icon

**Solution:**
1. Verify `public/icons/icon.ico` exists
2. Ensure file is valid ICO format (not PNG with .ico extension)
3. Convert PNG to ICO if needed:
   - Use online tools: icoconvert.com
   - Use Electron CLI: `npx electron-icon-builder --input icon.png --output public/icons/`
4. Re-run: `npm run build && npx electron-builder --win`

---

### Problem: Application crashes on launch

**Error:** EXE runs but closes immediately or shows error

**Solution:**
1. Check console logs: Add `console.log()` to `electron/main.ts`
2. Review TypeScript types: Ensure no runtime errors
3. Verify all dependencies loaded correctly
4. Run in dev mode first: `npm run dev`
5. Check that `dist/index.html` exists and is valid
6. Ensure resources folder structure is correct

---

## Advanced Build Options

### Build for 32-bit (x86) Systems

```bash
npx electron-builder --win --arch ia32 portable nsis
```

### Build for 64-bit Only

```bash
npx electron-builder --win --arch x64 portable nsis
```

### Build Without Signing (Default)

```bash
npx electron-builder --win --config.win.certificateFile=""
```

### Clean Build (Remove old dist)

```bash
# Windows
rmdir /s /q dist dist-electron

# Then rebuild
npm run build
npx electron-builder --win portable nsis
```

---

## Distribution

### NSIS Installer Distribution

The `TF Setup.exe` installer is recommended for:
- End-users downloading from a website
- Enterprise deployment via installer
- Users who prefer standard Windows installation experience
- Automatic uninstall via Control Panel

**Distribution steps:**
1. Copy `dist-electron/TF Setup.exe` to your distribution server/website
2. Include installation instructions: "Download and run TF Setup.exe"
3. Optionally generate installer configuration (NSIS)

### Portable EXE Distribution

The `TF.exe` portable executable is recommended for:
- Portable drives or USB sticks
- Enterprise deployment without installation rights
- Minimal system footprint
- Quick testing/evaluation

**Distribution steps:**
1. Copy `dist-electron/TF.exe` to your distribution folder
2. Include note: "Run TF.exe directly - no installation needed"
3. Include data folder if app generates files

### Release Notes Template

```markdown
# TestForge Release v1.0.0

**Build Date:** [Current Date]
**Platform:** Windows 10+

## Installation Options

### Option 1: NSIS Installer (Recommended for most users)
- Download: `TF Setup.exe`
- Run installer and follow wizard
- Includes uninstall support

### Option 2: Portable Executable
- Download: `TF.exe`
- Run directly - no installation needed
- Ideal for portable drives

## System Requirements
- Windows 10 or higher
- 2 GB RAM minimum
- 500 MB disk space
- Internet connection (for AI API)

## API Setup
1. Open Settings in TestForge
2. Enter your Claude or Gemini API key
3. Select preferred AI model
4. Save settings

## What's Included
- Desktop recording capability
- AI test case generation
- Word document export
- Multi-model AI support (Claude, Gemini)
```

---

## Build Scripts Reference

**All available npm scripts in package.json:**

| Script | Command | Purpose |
|--------|---------|---------|
| dev | `npm run dev` | Start development server with hot reload |
| build | `npm run build` | Production TypeScript compile + bundle |
| lint | `npm run lint` | Run ESLint on all files |
| preview | `npm run preview` | Preview production build locally |

---

## Performance Tips

1. **Faster builds:** Close other applications to free RAM
2. **Incremental builds:** TypeScript builds are incremental - faster on repeat builds
3. **Cache:** npm cache is located at `C:\Users\<user>\AppData\Roaming\npm-cache`
4. **SSD recommendation:** Build on SSD for 2-3x faster compilation

---

## Project Structure Reference

```
testcase-recorder/
├── electron/                    # Electron main process
│   ├── main.ts                 # Entry point
│   ├── ipcHandlers.ts          # IPC communication
│   ├── actionObserver.ts       # Recording logic
│   └── ...
│
├── src/                         # React frontend
│   ├── main.tsx                # Entry point
│   ├── pages/                  # UI pages
│   ├── services/               # AI services
│   ├── store/                  # State management
│   └── ...
│
├── public/                      # Static assets
│   └── icons/                  # Application icons
│
├── electron-builder.config.js  # Build configuration
├── vite.config.ts              # Bundler configuration
├── package.json                # Dependencies & scripts
└── tsconfig.json               # TypeScript config
```

---

## Frequently Asked Questions (FAQ)

### Q: Why are the EXE files so large (~150-200 MB)?

**A:** Electron includes Chromium, V8 engine, and Node.js runtime in every build. This is expected for Electron applications. You can reduce size by:
- Removing unused dependencies
- Code minification (already enabled)
- Using electron-builder's unpacked option

### Q: Can I code-sign the EXE?

**A:** Yes, but it requires a code signing certificate ($200-300/year). To add signing:
1. Obtain a code signing certificate
2. Configure in `electron-builder.config.js`:
   ```javascript
   win: {
     certificateFile: "path/to/cert.pfx",
     certificatePassword: "password"
   }
   ```
3. Rebuild with `npx electron-builder --win`

### Q: How do I update the app version?

**A:** Edit `package.json`:
```json
{
  "version": "1.0.1"
}
```

Then rebuild. The version will appear in installer and About dialog.

### Q: Can I build for macOS or Linux?

**A:** Yes, but you need to build on that platform (or use CI/CD):
- **macOS:** `npm run build && npx electron-builder --mac`
- **Linux:** `npm run build && npx electron-builder --linux`

Windows build must run on Windows.

### Q: Can I create auto-update functionality?

**A:** Yes, using `electron-updater`:
1. Install: `npm install electron-updater`
2. Configure update server
3. Add update checks in `electron/main.ts`
4. Host release artifacts on server

---

## Support and Resources

- **Electron Documentation:** https://www.electronjs.org/docs
- **Electron-Builder Docs:** https://www.electron.build/
- **TestForge Architecture:** See `MD_Files/TestForge_Architecture.md`
- **Project Structure:** See `MD_Files/TestForge_Study.md`

---

**Last Updated:** June 2026
**Tested with:** Node.js 18+, npm 9+, Electron 42.2.0, electron-builder 26.8.1
