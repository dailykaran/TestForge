//#endregion
//#region electron/preload.ts
var { ipcRenderer, contextBridge } = (/* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, { get: (a, b) => (typeof require !== "undefined" ? require : a)[b] }) : x)(function(x) {
	if (typeof require !== "undefined") return require.apply(this, arguments);
	throw Error("Calling `require` for \"" + x + "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.");
}))("electron");
try {
	contextBridge.exposeInMainWorld("ipcRenderer", {
		invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
		on: (channel, listener) => {
			const subscription = (event, ...args) => listener(event, ...args);
			ipcRenderer.on(channel, subscription);
			return () => ipcRenderer.removeListener(channel, subscription);
		},
		send: (channel, ...args) => ipcRenderer.send(channel, ...args)
	});
	console.log("✓ ipcRenderer exposed to main world");
} catch (error) {
	console.error("✗ Failed to expose ipcRenderer:", error);
}
//#endregion
