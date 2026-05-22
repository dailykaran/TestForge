import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';

export default function Settings() {
  const { geminiApiKey, claudeApiKey, defaultModel, setApiKeys, setDefaultModel, setRoute } = useAppStore();

  const [geminiKeyInput, setGeminiKeyInput] = useState(geminiApiKey);
  const [claudeKeyInput, setClaudeKeyInput] = useState(claudeApiKey);
  const [modelInput, setModelInput] = useState(defaultModel);

  const handleSave = () => {
    setApiKeys({ gemini: geminiKeyInput, claude: claudeKeyInput });
    setDefaultModel(modelInput);
    setRoute('dashboard');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto">
      <header className="px-8 py-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setRoute('dashboard')}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-300" />
          </button>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Settings</h1>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
        >
          <Save className="w-5 h-5" />
          Save Changes
        </button>
      </header>

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8">
        <section className="bg-slate-800/50 rounded-3xl p-8 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold">API Configuration</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Google Gemini API Key</label>
              <input
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              <p className="text-xs text-slate-500 mt-2">Required for Gemini 2.0. Keys are stored locally.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Anthropic Claude API Key</label>
              <input
                type="password"
                value={claudeKeyInput}
                onChange={(e) => setClaudeKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              <p className="text-xs text-slate-500 mt-2">Required for Claude Sonnet 3.5+. Keys are stored locally.</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-800/50 rounded-3xl p-8 border border-slate-700/50">
          <h2 className="text-xl font-semibold mb-6">Model Preferences</h2>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Default Generation Model</label>
            <div className="relative">
              <select
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              >
                <optgroup label="Google - Verified Working">
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash ⭐ (Recommended)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                </optgroup>
                <optgroup label="Google - Older">
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                </optgroup>
                <optgroup label="Anthropic">
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                </optgroup>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
