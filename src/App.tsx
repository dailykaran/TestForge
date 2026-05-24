import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore.ts';
import { setSessionStartTime, clearSessionStorage, notifySessionClear } from './utils/sessionMemoryUtils.ts';
import Dashboard from './pages/Dashboard.tsx';
import RecordingSetup from './pages/RecordingSetup.tsx';
import Recording from './pages/Recording.tsx';
import Review from './pages/Review.tsx';
import Settings from './pages/Settings.tsx';
import { ActionEvent } from './types.ts';

export default function App() {
  const { currentRoute, addAction } = useAppStore();

  useEffect(() => {
    // Initialize session memory tracking
    setSessionStartTime(Date.now());
    console.log('Session memory initialized');
    
    // Cleanup on app close
    const handleBeforeUnload = () => {
      notifySessionClear();
      clearSessionStorage();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    // Listen for actions from IPC
      if (window.ipcRenderer) {
      const unsubscribe = window.ipcRenderer.on('action-captured', (_, action) => {
        addAction(action as ActionEvent);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [addAction]);

  const renderRoute = () => {
    switch (currentRoute) {
      case 'dashboard': return <Dashboard />;
      case 'setup': return <RecordingSetup />;
      case 'recording': return <Recording />;
      case 'review': return <Review />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Basic Titlebar Drag Area */}
      <div className="h-8 w-full bg-slate-800 shrink-0 select-none flex items-center px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-xs font-semibold text-slate-300">TestForge</span>
      </div>
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {renderRoute()}
      </main>
    </div>
  );
}
