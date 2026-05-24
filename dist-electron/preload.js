let electron = require("electron");
//#region electron/preload.ts
var ALLOWED_CHANNELS = {
	"get-desktop-sources": true,
	"save-video": true,
	"read-file-base64": true,
	"download-file": true,
	"start-observing": true,
	"stop-observing": true,
	"action-captured": true,
	"set-generator-active": true,
	"session-memory-clear": true,
	"get-gemini-api-key": true,
	"get-claude-api-key": true,
	"set-gemini-api-key": true,
	"set-claude-api-key": true,
	"clear-api-keys": true,
	"generate-test-cases": true,
	"ipc-auto-test-result": true
};
function validateChannel(channel) {
	if (!ALLOWED_CHANNELS[channel]) {
		console.warn(`[SECURITY] Blocked unauthorized IPC channel: ${channel}`);
		return false;
	}
	return true;
}
try {
	electron.contextBridge.exposeInMainWorld("ipcRenderer", {
		invoke: function(channel, ...args) {
			if (!validateChannel(channel)) return Promise.reject(/* @__PURE__ */ new Error(`IPC channel not allowed: ${channel}`));
			return electron.ipcRenderer.invoke(channel, ...args);
		},
		on: function(channel, listener) {
			if (!validateChannel(channel)) {
				console.error(`IPC channel not allowed: ${channel}`);
				return function() {};
			}
			const subscription = function(event, ...args) {
				listener(event, ...args);
			};
			electron.ipcRenderer.on(channel, subscription);
			return function() {
				electron.ipcRenderer.removeListener(channel, subscription);
			};
		},
		send: function(channel, ...args) {
			if (!validateChannel(channel)) {
				console.error(`IPC channel not allowed: ${channel}`);
				return;
			}
			electron.ipcRenderer.send(channel, ...args);
		}
	});
	console.log("✓ ipcRenderer exposed to main world with security validation");
} catch (error) {
	console.error("✗ Failed to expose ipcRenderer:", error);
}
try {
	if (process.env.RUN_IPC_TEST === "1") (async () => {
		try {
			console.log("IPC auto-test: starting");
			const payload = Buffer.from(`electron-ipc-test-${Date.now()}`);
			const savedPath = await electron.ipcRenderer.invoke("save-video", payload);
			console.log("IPC auto-test: savedPath", savedPath);
			const b64 = await electron.ipcRenderer.invoke("read-file-base64", savedPath);
			console.log("IPC auto-test: read base64 length", typeof b64 === "string" ? b64.length : "invalid");
			const hasGemini = await electron.ipcRenderer.invoke("get-gemini-api-key");
			console.log("IPC auto-test: hasGeminiKey", hasGemini);
			const clearResult = await electron.ipcRenderer.invoke("clear-api-keys");
			console.log("IPC auto-test: clear-api-keys", clearResult);
			console.log("IPC auto-test: success");
			try {
				electron.ipcRenderer.send("ipc-auto-test-result", { status: "success" });
			} catch (e) {
				console.warn("Failed to send ipc-auto-test-result success", e);
			}
			setTimeout(() => {
				try {
					globalThis.window?.close?.();
				} catch (e) {}
			}, 800);
		} catch (err) {
			console.error("IPC auto-test: failed", err);
			try {
				electron.ipcRenderer.send("ipc-auto-test-result", {
					status: "failure",
					message: String(err)
				});
			} catch (e) {
				console.warn("Failed to send ipc-auto-test-result failure", e);
			}
		}
	})();
} catch (err) {
	console.error("IPC auto-test bootstrap failed:", err);
}
//#endregion
