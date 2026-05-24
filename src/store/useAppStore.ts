import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ActionEvent } from '../types.ts';

interface AppState {
  isRecording: boolean;
  currentRoute: 'dashboard' | 'setup' | 'recording' | 'review' | 'settings';
  actions: ActionEvent[];
  videoPath: string | null;
  selectedSourceId: string | null;
  defaultModel: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  setRoute: (route: 'dashboard' | 'setup' | 'recording' | 'review' | 'settings') => void;
  setRecording: (status: boolean) => void;
  addAction: (action: ActionEvent) => void;
  setVideoPath: (path: string) => void;
  setSelectedSource: (id: string | null) => void;
  setDefaultModel: (model: string) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  clearActions: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isRecording: false,
      currentRoute: 'dashboard',
      actions: [],
      videoPath: null,
      selectedSourceId: null,
      defaultModel: 'gemini-2.5-flash',
      audioEnabled: true,
      videoEnabled: true,
      setRoute: (route) => set({ currentRoute: route }),
      setRecording: (status) => set({ isRecording: status }),
      addAction: (action) => set((state) => ({ actions: [...state.actions, action] })),
      setVideoPath: (path) => set({ videoPath: path }),
      setSelectedSource: (id) => set({ selectedSourceId: id }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
      setVideoEnabled: (enabled) => set({ videoEnabled: enabled }),
      clearActions: () => set({ actions: [] })
    }),
    {
      name: 'testforge-app-store',
      partialize: (state) => ({
        defaultModel: state.defaultModel,
      }),
    }
  )
);
