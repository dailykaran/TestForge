import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Save, ShieldCheck, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { isValidApiKeyFormat, validateGeminiApiKeyAtRuntime } from '../utils/validation';

export default function Settings() {
  const { defaultModel, setDefaultModel, setRoute } = useAppStore();

  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [claudeKeyInput, setClaudeKeyInput] = useState('');
  const [modelInput, setModelInput] = useState(defaultModel);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidatingGeminiKey, setIsValidatingGeminiKey] = useState(false);
  const [geminiValidationError, setGeminiValidationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [geminiKeyExists, setGeminiKeyExists] = useState(false);
  const [claudeKeyExists, setClaudeKeyExists] = useState(false);

  // Sync model input when store's defaultModel changes
  useEffect(() => {
    // Defer to avoid triggering synchronous setState during effect
    const t = setTimeout(() => setModelInput(defaultModel), 0);
    return () => clearTimeout(t);
  }, [defaultModel]);

  // Load API key status on component mount
  useEffect(() => {
    const loadKeyStatus = async () => {
      try {
        if (!window.ipcRenderer) {
          console.error('IPC Renderer not available');
          return;
        }
        
        try {
          const geminiExists = await window.ipcRenderer.invoke('get-gemini-api-key') as boolean;
          setGeminiKeyExists(Boolean(geminiExists));
        } catch (error) {
          console.error('Error loading Gemini key status:', error);
          setGeminiKeyExists(false);
        }
        
        try {
          const claudeExists = await window.ipcRenderer.invoke('get-claude-api-key') as boolean;
          setClaudeKeyExists(Boolean(claudeExists));
        } catch (error) {
          console.error('Error loading Claude key status:', error);
          setClaudeKeyExists(false);
        }
      } catch (error) {
        console.error('Error loading key status:', error);
      }
    };
    
    // Delay to ensure IPC is ready
    const timer = setTimeout(loadKeyStatus, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    setGeminiValidationError(null);

    try {
      // Validate Gemini key at runtime if provided
      if (geminiKeyInput.trim()) {
        // Basic format check first
        if (!isValidApiKeyFormat(geminiKeyInput, 'gemini')) {
          throw new Error('Gemini API key is too short (minimum 20 characters)');
        }

        // Runtime validation - test the key with the Gemini API
        setIsValidatingGeminiKey(true);
        const validationResult = await validateGeminiApiKeyAtRuntime(geminiKeyInput);
        setIsValidatingGeminiKey(false);

        if (!validationResult.valid) {
          setGeminiValidationError(validationResult.error || 'Failed to validate API key');
          throw new Error(validationResult.error || 'Failed to validate Gemini API key');
        }
      }

      // Validate Claude key format if provided
      if (claudeKeyInput.trim() && !isValidApiKeyFormat(claudeKeyInput, 'claude')) {
        throw new Error('Invalid Claude API key format. Should start with "sk-ant-"');
      }

      // Save Gemini key if provided
      if (geminiKeyInput.trim()) {
        const result = await window.ipcRenderer.invoke('set-gemini-api-key', geminiKeyInput) as { success?: boolean; message?: string } | null;
        if (!result?.success) {
          throw new Error(result?.message || 'Failed to save Gemini API key');
        }
        setGeminiKeyExists(true);
        setGeminiKeyInput('');
      }

      // Save Claude key if provided
      if (claudeKeyInput.trim()) {
        const result = await window.ipcRenderer.invoke('set-claude-api-key', claudeKeyInput) as { success?: boolean; message?: string } | null;
        if (!result?.success) {
          throw new Error(result?.message || 'Failed to save Claude API key');
        }
        setClaudeKeyExists(true);
        setClaudeKeyInput('');
      }

      // Save model preference
      setDefaultModel(modelInput);

      setSaveStatus({
        type: 'success',
        message: 'Settings saved successfully. API keys stored securely in OS keychain.'
      });

      setTimeout(() => {
        setRoute('dashboard');
      }, 1500);
    } catch (error: unknown) {
      setSaveStatus({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || 'Failed to save settings'
      });
    } finally {
      setIsSaving(false);
      setIsValidatingGeminiKey(false);
    }
  };

  const handleClearKeys = async () => {
    if (confirm('Are you sure you want to clear all saved API keys?')) {
      try {
        await window.ipcRenderer.invoke('clear-api-keys');
        setGeminiKeyExists(false);
        setClaudeKeyExists(false);
        setSaveStatus({
          type: 'success',
          message: 'API keys cleared successfully'
        });
      } catch (error: unknown) {
        setSaveStatus({
          type: 'error',
          message: error instanceof Error ? error.message : String(error) || 'Failed to clear API keys'
        });
      }
    }
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
          disabled={isSaving || isValidatingGeminiKey}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
        >
          {isValidatingGeminiKey ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </>
          )}
        </button>
      </header>

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8">
        
        {/* Status Message */}
        {saveStatus && (
          <div className={`flex items-center gap-3 p-4 rounded-xl ${
            saveStatus.type === 'success'
              ? 'bg-emerald-900/20 border border-emerald-500/30'
              : 'bg-red-900/20 border border-red-500/30'
          }`}>
            {saveStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <p className={saveStatus.type === 'success' ? 'text-emerald-200' : 'text-red-200'}>
              {saveStatus.message}
            </p>
          </div>
        )}

        <section className="bg-slate-800/50 rounded-3xl p-8 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold">API Configuration</h2>
            <span className="text-xs text-slate-400 ml-auto">🔐 Stored in OS Keychain</span>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-400">Google Gemini API Key</label>
                {geminiKeyExists && (
                  <span className="text-xs bg-emerald-900/30 text-emerald-200 px-2 py-1 rounded">
                    ✓ Configured
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => {
                    setGeminiKeyInput(e.target.value);
                    setGeminiValidationError(null);
                  }}
                  placeholder={geminiKeyExists ? "Leave blank to keep current key" : "Paste your Google API key"}
                  disabled={isValidatingGeminiKey}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all disabled:opacity-50"
                />
                {isValidatingGeminiKey && (
                  <div className="absolute right-3 top-3">
                    <Loader className="w-5 h-5 text-blue-400 animate-spin" />
                  </div>
                )}
              </div>
              {geminiValidationError && (
                <p className="text-xs text-red-400 mt-2 flex items-start gap-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {geminiValidationError}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Any Google API key format is accepted. Keys are validated when you click Save and securely stored in your OS keychain.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-400">Anthropic Claude API Key</label>
                {claudeKeyExists && (
                  <span className="text-xs bg-emerald-900/30 text-emerald-200 px-2 py-1 rounded">
                    ✓ Configured
                  </span>
                )}
              </div>
              <input
                type="password"
                value={claudeKeyInput}
                onChange={(e) => setClaudeKeyInput(e.target.value)}
                placeholder={claudeKeyExists ? "Leave blank to keep current key" : "sk-ant-..."}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              <p className="text-xs text-slate-500 mt-2">
                Enter new key to update. Keys are securely stored in your OS keychain, never in the app.
              </p>
            </div>

            {(geminiKeyExists || claudeKeyExists) && (
              <div className="pt-4 border-t border-slate-700">
                <button
                  onClick={handleClearKeys}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear All API Keys
                </button>
              </div>
            )}
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
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
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

        <section className="bg-slate-800/50 rounded-3xl p-8 border border-slate-700/50">
          <h2 className="text-xl font-semibold mb-4">Security Information</h2>
          <div className="space-y-3 text-sm text-slate-400">
            <p>✓ API keys are stored in your operating system's secure keychain:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Windows:</strong> Credential Manager</li>
              <li><strong>macOS:</strong> Keychain</li>
              <li><strong>Linux:</strong> Secret Service</li>
            </ul>
            <p className="mt-4">✓ API keys are never stored in the app or visible in DevTools</p>
            <p>✓ Test case generation happens on your computer's main process, away from browser context</p>
            <p>✓ File paths are validated to prevent unauthorized access</p>
          </div>
        </section>
      </div>
    </div>
  );
}
