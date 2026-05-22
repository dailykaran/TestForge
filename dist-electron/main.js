import { BrowserWindow, app, desktopCapturer, dialog, ipcMain, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { uIOhook } from "uiohook-napi";
import screenshot from "screenshot-desktop";
import { v4 } from "uuid";
//#region electron/screenshotCapture.ts
async function captureScreenshot() {
	try {
		const tempDir = app.getPath("temp");
		const screenshotsDir = path.join(tempDir, "screenshots");
		if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
		const filename = `screenshot_${Date.now()}_${v4()}.png`;
		const filePath = path.join(screenshotsDir, filename);
		await screenshot({ filename: filePath });
		return filePath;
	} catch (err) {
		console.error("Failed to capture screenshot:", err);
		return null;
	}
}
//#endregion
//#region electron/actionObserver.ts
var isObserving = false;
var mainWindow = null;
var lastScrollTime = 0;
var isGeneratorActive = false;
function setObserverWindow(win) {
	mainWindow = win;
}
function setGeneratorActive(active) {
	isGeneratorActive = active;
}
function sendAction(action) {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("action-captured", action);
}
function startObserving() {
	if (isObserving) return;
	isObserving = true;
	uIOhook.on("click", async (e) => {
		if (e.button === 1 && !isGeneratorActive) {
			const screenshotPath = await captureScreenshot();
			sendAction({
				id: v4(),
				timestamp: Date.now(),
				type: "click",
				label: "Mouse Click",
				coordinates: {
					x: e.x,
					y: e.y
				},
				screenshotPath: screenshotPath || void 0
			});
		}
	});
	uIOhook.on("keydown", (e) => {
		if (!isGeneratorActive) sendAction({
			id: v4(),
			timestamp: Date.now(),
			type: "key_press",
			label: "Key Press",
			keyCombo: e.keycode.toString()
		});
	});
	uIOhook.on("wheel", (e) => {
		const now = Date.now();
		if (now - lastScrollTime > 3e3 && !isGeneratorActive) {
			lastScrollTime = now;
			sendAction({
				id: v4(),
				timestamp: Date.now(),
				type: "scroll",
				label: e.rotation > 0 ? "Scroll Down" : "Scroll Up"
			});
		}
	});
	try {
		uIOhook.start();
	} catch (err) {
		console.error("Failed to start uIOhook:", err);
	}
}
function stopObserving() {
	if (!isObserving) return;
	isObserving = false;
	try {
		uIOhook.stop();
	} catch (err) {}
}
//#endregion
//#region electron/ipcHandlers.ts
function setupIpcHandlers(win) {
	setObserverWindow(win);
	ipcMain.handle("get-desktop-sources", async () => {
		return (await desktopCapturer.getSources({
			types: ["window", "screen"],
			thumbnailSize: {
				width: 400,
				height: 400
			}
		})).map((source) => ({
			id: source.id,
			name: source.name,
			thumbnail: source.thumbnail.toDataURL()
		}));
	});
	ipcMain.handle("save-video", async (_, buffer) => {
		const tempDir = app.getPath("temp");
		const filePath = path.join(tempDir, `recording_${Date.now()}.webm`);
		fs.writeFileSync(filePath, buffer);
		return filePath;
	});
	ipcMain.on("start-observing", () => {
		startObserving();
	});
	ipcMain.on("stop-observing", () => {
		stopObserving();
	});
	ipcMain.on("set-generator-active", (_, active) => {
		setGeneratorActive(active);
	});
	ipcMain.on("session-memory-clear", () => {
		console.log("Session memory clear event received from renderer");
	});
	ipcMain.handle("read-file-base64", (_, filePath) => {
		try {
			if (fs.existsSync(filePath)) return fs.readFileSync(filePath).toString("base64");
		} catch (e) {}
		return "";
	});
	ipcMain.handle("download-file", async (event, sourcePath) => {
		try {
			if (!sourcePath) throw new Error("No video path provided");
			if (!fs.existsSync(sourcePath)) throw new Error("Video file not found");
			const windowContext = BrowserWindow.fromWebContents(event.sender);
			if (!windowContext) throw new Error("Window context not found");
			const { canceled, filePath } = await dialog.showSaveDialog(windowContext, {
				defaultPath: `recording_${Date.now()}.webm`,
				filters: [{
					name: "Videos",
					extensions: ["webm"]
				}]
			});
			if (!canceled && filePath) {
				fs.copyFileSync(sourcePath, filePath);
				return {
					success: true,
					message: `Video saved to ${filePath}`
				};
			} else return {
				success: false,
				message: "Save canceled"
			};
		} catch (error) {
			console.error("Download file error:", error);
			throw new Error(`Failed to save video: ${error.message}`);
		}
	});
}
//#endregion
//#region electron/iconHelper.ts
function getAppIcon() {
	const iconsDir = path.join(process.cwd(), "public", "icons");
	const pngPath = path.join(iconsDir, "icon-256x256.png");
	if (fs.existsSync(pngPath)) {
		console.log("Using existing PNG icon:", pngPath);
		return nativeImage.createFromPath(pngPath);
	}
	const dataUrl = `data:image/svg+xml;base64,${Buffer.from(`
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
  `).toString("base64")}`;
	try {
		return nativeImage.createFromDataURL(dataUrl);
	} catch (error) {
		console.error("Failed to create icon:", error);
		return;
	}
}
//#endregion
//#region electron/main.ts
var APP_ROOT = process.cwd();
process.env.APP_ROOT = APP_ROOT;
var __dirname = path.join(APP_ROOT, "dist-electron");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win;
function createWindow() {
	const preloadPath = path.join(__dirname, "preload.js");
	console.log("Creating window with preload:", preloadPath);
	console.log("Preload exists:", fs.existsSync(preloadPath));
	win = new BrowserWindow({
		icon: getAppIcon(),
		width: 1200,
		height: 800,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	win.setTitle("TestForge");
	if (VITE_DEV_SERVER_URL) {
		console.log("Loading dev server:", VITE_DEV_SERVER_URL);
		win.loadURL(VITE_DEV_SERVER_URL);
	} else {
		console.log("Loading from file:", path.join(RENDERER_DIST, "index.html"));
		win.loadFile(path.join(RENDERER_DIST, "index.html"));
	}
	win.webContents.on("preload-error", (event, preloadPath, error) => {
		console.error("Preload error:", preloadPath, error);
	});
}
function cleanupTempFiles() {
	try {
		const tempDir = app.getPath("temp");
		const screenshotsDir = path.join(tempDir, "screenshots");
		if (fs.existsSync(screenshotsDir)) {
			fs.readdirSync(screenshotsDir).forEach((file) => {
				try {
					fs.unlinkSync(path.join(screenshotsDir, file));
				} catch (e) {
					console.warn("Failed to delete screenshot:", file);
				}
			});
			try {
				fs.rmdirSync(screenshotsDir);
			} catch (e) {
				console.warn("Failed to remove screenshots directory");
			}
		}
		fs.readdirSync(tempDir).forEach((file) => {
			if (file.startsWith("recording_") && file.endsWith(".webm")) try {
				fs.unlinkSync(path.join(tempDir, file));
			} catch (e) {
				console.warn("Failed to delete video file:", file);
			}
		});
		console.log("Temporary files cleaned up successfully");
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
}
/**
* Handles app closure and cleanup
* 
* Cleanup sequence:
* 1. Renderer process clears sessionStorage via sessionMemoryUtils
* 2. Main process receives 'session-memory-clear' IPC event
* 3. Temp files are deleted (videos, screenshots)
* 4. Session memory (Zustand store) automatically clears as it's in-memory only
* 5. App quits
*/
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		cleanupTempFiles();
		app.quit();
		win = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
	createWindow();
	if (win) setupIpcHandlers(win);
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
