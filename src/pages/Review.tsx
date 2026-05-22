import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, PlayCircle, Download, FileText, CheckCircle2, Wand2, Image as ImageIcon } from 'lucide-react';
import { generateTestCasesWithGemini } from '../services/geminiService';
import { generateTestCasesWithClaude } from '../services/claudeService';
import { exportToDocx, exportToTxt } from '../services/exportService';

export default function Review() {
  const { actions, videoPath, geminiApiKey, claudeApiKey, defaultModel, setRoute, clearActions, setVideoPath } = useAppStore();
  const [testCases, setTestCases] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  
  // Load video file and create blob URL for reliable playback
  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;
    
    const loadVideo = async () => {
      if (!videoPath) {
        if (isMounted) setVideoBlobUrl(null);
        return;
      }
      
      try {
        if (!window.ipcRenderer) {
          console.error('IPC Renderer not available');
          if (isMounted) setVideoBlobUrl(null);
          return;
        }
        
        console.log('Loading video from path:', videoPath);
        const base64Data = await window.ipcRenderer.invoke('read-file-base64', videoPath);
        
        if (!base64Data || base64Data.trim() === '') {
          console.error('Failed to read video file - empty base64 response');
          if (isMounted) setVideoBlobUrl(null);
          return;
        }
        
        console.log('Base64 data received, size:', base64Data.length);
        
        // Convert base64 to blob using fetch API (more reliable)
        const response = await fetch(`data:video/webm;base64,${base64Data}`);
        const blob = await response.blob();
        
        if (blob.size === 0) {
          console.error('Blob size is 0');
          if (isMounted) setVideoBlobUrl(null);
          return;
        }
        
        objectUrl = URL.createObjectURL(blob);
        console.log('Video blob URL created:', objectUrl);
        
        if (isMounted) {
          setVideoBlobUrl(objectUrl);
        }
      } catch (error) {
        console.error('Error loading video:', error);
        if (isMounted) {
          setVideoBlobUrl(null);
        }
      }
    };
    
    loadVideo();
    
    // Cleanup blob URL on unmount
    return () => {
      isMounted = false;
      if (objectUrl) {
        console.log('Revoking blob URL:', objectUrl);
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [videoPath]);
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    if (window.ipcRenderer) {
      window.ipcRenderer.send('set-generator-active', true);
    }
    try {
      const screenshots: string[] = [];
      for (const action of actions) {
        if (action.screenshotPath) {
          try {
            const b64 = await window.ipcRenderer.invoke('read-file-base64', action.screenshotPath);
            screenshots.push(b64);
          } catch(e) {}
        }
      }
      
      let result = '';
      if (defaultModel.includes('gemini')) {
        if (!geminiApiKey) throw new Error("Missing Gemini API Key in Settings");
        result = await generateTestCasesWithGemini(actions, screenshots, geminiApiKey, defaultModel);
      } else {
        if (!claudeApiKey) throw new Error("Missing Claude API Key in Settings");
        result = await generateTestCasesWithClaude(actions, screenshots, claudeApiKey, defaultModel);
      }
      
      setTestCases(result);
    } catch (err: any) {
      alert("Error generating test cases: " + err.message);
    } finally {
      if (window.ipcRenderer) {
        window.ipcRenderer.send('set-generator-active', false);
      }
      setIsGenerating(false);
    }
  };

  const downloadVideo = async () => {
    if (!videoPath) {
      alert('No video path available');
      return;
    }
    setIsSavingVideo(true);
    try {
      const result = await window.ipcRenderer.invoke('download-file', videoPath);
      if (result && result.success) {
        alert('Video saved successfully!');
      } else {
        alert(result?.message || 'Failed to save video');
      }
    } catch (error: any) {
      console.error('Save video error:', error);
      alert(`Error saving video: ${error.message}`);
    } finally {
      setIsSavingVideo(false);
    }
  };

  const handleExportDocx = async () => {
    if (!testCases) return;
    const blob = await exportToDocx(testCases);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TestCases_${Date.now()}.docx`;
    a.click();
  };

  const handleExportTxt = () => {
    if (!testCases) return;
    const blob = exportToTxt(testCases);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TestCases_${Date.now()}.txt`;
    a.click();
  };
  
  const downloadScreenshot = async (screenshotPath: string, actionLabel: string) => {
    try {
      if (!screenshotPath) {
        alert('Screenshot path not available');
        return;
      }
      const b64 = await window.ipcRenderer.invoke('read-file-base64', screenshotPath);
      if (!b64) {
        alert('Failed to read screenshot');
        return;
      }
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screenshot_${actionLabel.replace(/\s+/g, '_')}_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Screenshot download error:', error);
      alert(`Error downloading screenshot: ${error.message}`);
    }
  };

  const handleDiscard = () => {
    clearActions();
    setVideoPath('');
    setRoute('dashboard');
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto w-full">
      <header className="px-8 py-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={handleDiscard} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-300" />
          </button>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Review Session</h1>
        </div>
        <div className="flex gap-3">
           <button 
            onClick={downloadVideo}
            disabled={!videoPath || isSavingVideo}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl font-medium transition-all"
          >
            <PlayCircle className="w-5 h-5" />
            {isSavingVideo ? 'Saving...' : 'Save Video'}
          </button>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || actions.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl font-medium transition-all shadow-lg"
          >
            <Wand2 className="w-5 h-5" />
            {isGenerating ? "Analyzing Session..." : "Generate Test Cases"}
          </button>
        </div>
      </header>
      
      <div className="flex-1 p-8 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 h-full min-h-0">
        
        <div className="space-y-6 flex flex-col h-full min-h-0">
          <div className="bg-black aspect-video rounded-3xl overflow-hidden border border-slate-700 shadow-2xl shrink-0">
             {videoBlobUrl ? (
               <video 
                 src={videoBlobUrl}
                 controls 
                 className="w-full h-full object-contain"
                 onError={(e) => {
                   console.error('Video playback error:', e);
                   alert('Failed to play video. Try saving and reopening.');
                 }}
               />
             ) : videoPath ? (
               <div className="w-full h-full flex items-center justify-center text-slate-500">Loading video...</div>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-slate-500">No video recorded</div>
             )}
          </div>
          
          <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 p-6 flex flex-col flex-1 min-h-0 shadow-lg">
             <h3 className="text-lg font-semibold mb-4 text-slate-200 shrink-0">Captured Actions ({actions.length})</h3>
             <div className="flex-1 overflow-y-auto space-y-2 pr-2">
               {actions.map(a => (
                 <div key={a.id} className="text-sm p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 flex justify-between items-center group hover:border-slate-600 transition-colors">
                   <div className="flex flex-col flex-1">
                     <span className="text-slate-300 font-medium">{a.label}</span>
                     {a.screenshotPath && <span className="text-[10px] text-blue-400 mt-1">Has Screenshot</span>}
                   </div>
                   <div className="flex items-center gap-2">
                     {a.screenshotPath && (
                       <button
                         onClick={() => downloadScreenshot(a.screenshotPath!, a.label)}
                         className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-blue-400 hover:text-blue-300"
                         title="Download screenshot"
                       >
                         <ImageIcon className="w-4 h-4" />
                       </button>
                     )}
                     <span className="text-slate-500 font-mono text-xs">{new Date(a.timestamp).toLocaleTimeString()}</span>
                   </div>
                 </div>
               ))}
               {actions.length === 0 && (
                 <p className="text-sm text-slate-500 text-center mt-10">No interactions recorded.</p>
               )}
             </div>
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-3xl border border-slate-700/50 flex flex-col overflow-hidden h-full min-h-[600px] shadow-2xl">
           <div className="p-6 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/60 shrink-0">
             <h2 className="text-xl font-semibold flex items-center gap-3">
               <CheckCircle2 className="w-6 h-6 text-emerald-400" />
               Automated Test Cases
             </h2>
             {testCases && (
               <div className="flex gap-2">
                 <button onClick={handleExportDocx} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 rounded-lg text-blue-400 transition-colors text-sm font-medium">
                   <Download className="w-4 h-4" /> DOCX
                 </button>
                 <button onClick={handleExportTxt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors text-sm font-medium">
                   <FileText className="w-4 h-4" /> TXT
                 </button>
               </div>
             )}
           </div>
           
           <div className="flex-1 p-8 overflow-y-auto w-full bg-slate-900/30 custom-scrollbar">
             {isGenerating ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6">
                 <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                 <p className="animate-pulse font-medium text-lg">AI is analyzing your session...</p>
               </div>
             ) : testCases ? (
               <div className="prose prose-invert prose-p:text-slate-300 prose-headings:text-slate-100 prose-a:text-blue-400 max-w-none whitespace-pre-wrap font-sans">
                 {testCases}
               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6 opacity-60">
                 <div className="p-6 bg-slate-800 rounded-full">
                   <FileText className="w-16 h-16" />
                 </div>
                 <p className="text-lg font-medium max-w-sm text-center">Click "Generate Test Cases" to process your recording and automatically write structured tests.</p>
               </div>
             )}
           </div>
        </div>

      </div>
    </div>
  );
}
