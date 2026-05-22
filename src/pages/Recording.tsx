import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Square, Activity, MousePointer2, Keyboard, Navigation, Mouse } from 'lucide-react';

// Simplified local enum definition since importing it from main process isn't easily resolvable in React without a shared lib folder.
const ActionType = {
  CLICK: 'click',
  KEY_PRESS: 'key_press',
  SCROLL: 'scroll',
  NAVIGATION: 'navigation'
};

export default function Recording() {
  const { selectedSourceId, setRoute, setVideoPath, setRecording, actions } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    async function startCapture() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
            },
          },
        });

        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          console.warn("No mic available");
        }

        const audioTracks = micStream ? micStream.getAudioTracks() : [];
        const combinedStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...audioTracks,
        ]);

        if (videoRef.current) {
          videoRef.current.srcObject = combinedStream;
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm; codecs=vp9' });
          const buffer = await blob.arrayBuffer();
          if (window.ipcRenderer) {
            const savedPath = await window.ipcRenderer.invoke('save-video', new Uint8Array(buffer));
            setVideoPath(savedPath);
          } else {
            console.error("IPC Renderer not available for saving video");
          }
          setRecording(false);
          setRoute('review');
        };

        recorder.start();
        setRecording(true);
        if (window.ipcRenderer) {
          window.ipcRenderer.send('start-observing');
        }

        interval = setInterval(() => setTimer(t => t + 1), 1000);

      } catch (err) {
        console.error("Recording error:", err);
        setRoute('setup');
      }
    }

    if (selectedSourceId) {
      startCapture();
    } else {
      setRoute('setup');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedSourceId]);

  const handleStop = () => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('stop-observing');
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case ActionType.CLICK: return <MousePointer2 className="w-4 h-4 text-blue-400" />;
      case ActionType.KEY_PRESS: return <Keyboard className="w-4 h-4 text-emerald-400" />;
      case ActionType.SCROLL: return <Mouse className="w-4 h-4 text-amber-400" />;
      case ActionType.NAVIGATION: return <Navigation className="w-4 h-4 text-purple-400" />;
      default: return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex justify-center h-full bg-slate-900 overflow-hidden">
      <div className="w-full h-full grid grid-cols-1 lg:grid-cols-3 gap-8 p-8 relative">
        <button 
          onClick={handleStop}
          className="absolute top-6 left-6 flex items-center justify-center gap-2 px-6 py-3 bg-red-600/90 hover:bg-red-500 text-white rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_30px_rgba(239,68,68,0.3)] z-50"
        >
          <Square className="w-5 h-5 fill-current" />
          Stop
        </button>
        
        <div className="lg:col-span-2 flex flex-col items-center h-full">
          <div className="w-full bg-black rounded-3xl overflow-hidden border border-slate-700/50 shadow-2xl relative flex-1 min-h-[400px]">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              className="w-full h-full object-contain"
            />
            <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-3 border border-slate-700">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              <span className="font-mono text-white text-lg tracking-widest">{formatTime(timer)}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl flex flex-col overflow-hidden hidden lg:flex h-full h-[calc(100vh-8rem)]">
          <div className="p-5 border-b border-slate-700/50 flex items-center gap-3 bg-slate-800/80">
            <Activity className="w-6 h-6 text-blue-400" />
            <h3 className="text-lg font-semibold text-slate-200">Live Activity Feed</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {actions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 opacity-60">
                <MousePointer2 className="w-10 h-10" />
                <p className="text-sm font-medium">Listening for interactions...</p>
              </div>
            ) : (
              actions.slice().reverse().map(action => (
                <div key={action.id} className="flex gap-4 text-sm p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 shadow-sm animate-fade-in-down">
                  <div className="mt-0.5 p-2 bg-slate-900/50 rounded-lg shrink-0">
                    {getActionIcon(action.type)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-slate-200 font-medium truncate" title={action.label}>{action.label}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </span>
                      {action.screenshotPath && (
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-[10px] font-bold tracking-wider select-none border border-blue-500/20">IMAGE</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
