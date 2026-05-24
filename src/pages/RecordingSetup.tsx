import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Monitor, ArrowLeft, Play, LayoutGrid, Mic, MicOff, Video, VideoOff } from 'lucide-react';

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

export default function RecordingSetup() {
  const { setRoute, setSelectedSource, selectedSourceId, audioEnabled, videoEnabled, setAudioEnabled, setVideoEnabled } = useAppStore();
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Checking if ipcRenderer is available...", window.ipcRenderer);
      if (!window.ipcRenderer) {
        throw new Error("IPC Renderer not available. The Electron preload script may not have loaded correctly. Try reloading the window.");
      }
      console.log("Attempting to get desktop sources...");
      const desktopSources = await window.ipcRenderer.invoke('get-desktop-sources');
      console.log("Desktop sources loaded:", desktopSources);
      if (!Array.isArray(desktopSources)) {
        throw new Error("Invalid response: sources is not an array");
      }
      setSources(desktopSources);
      setError(null);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("Failed to load sources:", errorMsg);
      setError(`Failed to load screens: ${errorMsg}`);
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Delay loadSources to avoid synchronous setState during effect
    const timer = setTimeout(() => { loadSources(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = () => {
    if (selectedSourceId) {
      console.log("Starting recording with source:", selectedSourceId);
      setRoute('recording');
    }
  };

  const handleSourceSelect = (sourceId: string) => {
    console.log("Source selected:", sourceId);
    setSelectedSource(sourceId);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto">
      <header className="px-8 py-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => setRoute('dashboard')} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-300" />
          </button>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Recording Setup</h1>
        </div>
        <button 
          onClick={handleStart}
          disabled={!selectedSourceId}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
        >
          <Play className="w-5 h-5" />
          Start Recording
        </button>
      </header>
      
      <div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-slate-300">
            <LayoutGrid className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Select Screen or Window</h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
                videoEnabled
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              Video
            </button>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
                audioEnabled
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              Audio
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="text-slate-400 animate-pulse text-center mt-20">Loading sources...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4">
            <div className="text-red-400 text-center mt-20 p-6 bg-red-900/20 rounded-lg border border-red-500/30 max-w-md">
              <p className="font-semibold mb-2">Error loading screens</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={loadSources}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
            >
              Retry
            </button>
          </div>
        ) : sources.length === 0 ? (
          <div className="text-slate-400 text-center mt-20 p-6 bg-slate-800 rounded-lg border border-slate-700">
            <Monitor className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="font-semibold mb-2">No screens or windows found</p>
            <p className="text-sm">Try minimizing other windows or check your system settings.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {sources.map(source => (
              <button
                key={source.id}
                onClick={() => handleSourceSelect(source.id)}
                className={`flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                  selectedSourceId === source.id 
                    ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-blue-900/20' 
                    : 'border-slate-800 bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="w-full aspect-video bg-black flex items-center justify-center p-2 relative">
                  {source.thumbnail ? (
                    <img src={source.thumbnail} alt={source.name} className="max-h-full max-w-full object-contain drop-shadow-lg rounded-sm" />
                  ) : <Monitor className="w-12 h-12 text-slate-600" />}
                </div>
                <div className="p-3 bg-slate-900/40 w-full text-left truncate font-medium text-sm text-slate-200" title={source.name}>
                  {source.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
