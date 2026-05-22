import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Video, Settings2, Play } from 'lucide-react';

export default function Dashboard() {
  const { setRoute } = useAppStore();

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-full h-full bg-slate-900">
      <div className="text-center mb-16 animate-fade-in-down">
        <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(37,99,235,0.4)]">
          <Video className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-300">
          TestForge
        </h1>
        <p className="text-slate-400 mt-5 text-lg font-light">Intelligent test case generation through visual actions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
        <button 
          onClick={() => setRoute('setup')}
          className="group flex flex-col items-center justify-center p-10 bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/20"
        >
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 group-hover:bg-blue-500 group-hover:scale-110 transition-all duration-300">
            <Play className="w-8 h-8 text-blue-400 group-hover:text-white ml-1" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">New Recording</h2>
          <p className="text-slate-400 text-center text-sm px-4">Capture your screen session and generate automated test cases seamlessly.</p>
        </button>

        <button 
          onClick={() => setRoute('settings')}
          className="group flex flex-col items-center justify-center p-10 bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-700/50 hover:border-slate-500/50 hover:bg-slate-800 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-900/40"
        >
          <div className="w-20 h-20 bg-slate-700/50 rounded-full flex items-center justify-center mb-6 group-hover:bg-slate-700 group-hover:rotate-45 transition-all duration-500">
            <Settings2 className="w-8 h-8 text-slate-300 group-hover:text-white" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Settings</h2>
          <p className="text-slate-400 text-center text-sm px-4">Configure your API keys, model preferences, and tracking behavior.</p>
        </button>
      </div>
    </div>
  );
}
