import { create } from 'zustand';
import { ActionEvent } from '../types.ts';

interface AppState {
  isRecording: boolean;
  currentRoute: 'dashboard' | 'setup' | 'recording' | 'review' | 'settings';
  actions: ActionEvent[];
  videoPath: string | null;
  selectedSourceId: string | null;
  geminiApiKey: string;
  claudeApiKey: string;
  defaultModel: string;
  setRoute: (route: 'dashboard' | 'setup' | 'recording' | 'review' | 'settings') => void;
  setRecording: (status: boolean) => void;
  addAction: (action: ActionEvent) => void;
  setVideoPath: (path: string) => void;
  setSelectedSource: (id: string | null) => void;
  setApiKeys: (keys: { gemini?: string, claude?: string }) => void;
  setDefaultModel: (model: string) => void;
  clearActions: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isRecording: false,
  currentRoute: 'dashboard',
  actions: [],
  videoPath: null,
  selectedSourceId: null,
  geminiApiKey: '',
  claudeApiKey: '',
  defaultModel: 'gemini-2.5-flash',  // Use: gemini-2.5-flash, gemini-3.1-flash-lite, or gemini-2.5-flash-lite
  setRoute: (route) => set({ currentRoute: route }),
  setRecording: (status) => set({ isRecording: status }),
  addAction: (action) => set((state) => ({ actions: [...state.actions, action] })),
  setVideoPath: (path) => set({ videoPath: path }),
  setSelectedSource: (id) => set({ selectedSourceId: id }),
  setApiKeys: (keys) => set((state) => ({
    geminiApiKey: keys.gemini !== undefined ? keys.gemini : state.geminiApiKey,
    claudeApiKey: keys.claude !== undefined ? keys.claude : state.claudeApiKey,
  })),
  setDefaultModel: (model) => set({ defaultModel: model }),
  clearActions: () => set({ actions: [] })
}));
