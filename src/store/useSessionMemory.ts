import { create } from 'zustand';

/**
 * Session Memory Store
 * Temporary in-memory storage that automatically clears when the app is closed.
 * Use this for storing temporary data that shouldn't persist across app restarts.
 * 
 * Examples: temporary notes, cache data, temporary preferences, session-specific state
 */

interface SessionMemoryState {
  // Generic key-value storage for temporary data
  tempData: Record<string, unknown>;
  
  // Session-specific settings
  lastGeneratedTestCase: string | null;
  sessionStartTime: number;
  generationHistory: Array<{ timestamp: number; modelUsed: string; actionCount: number }>;
  
  // Temporary UI state
  expandedActionIds: Set<string>;
  
  // Methods
  setTempData: (key: string, value: unknown) => void;
  getTempData: (key: string) => unknown;
  deleteTempData: (key: string) => void;
  clearAllTempData: () => void;
  
  setLastGeneratedTestCase: (testCase: string | null) => void;
  addToGenerationHistory: (modelUsed: string, actionCount: number) => void;
  
  toggleExpandedAction: (actionId: string) => void;
  clearExpandedActions: () => void;
  
  // Clear all session memory (called on app close)
  resetSessionMemory: () => void;
}

const initialState = {
  tempData: {} as Record<string, unknown>,
  lastGeneratedTestCase: null as string | null,
  sessionStartTime: Date.now(),
  generationHistory: [] as Array<{ timestamp: number; modelUsed: string; actionCount: number }>,
  expandedActionIds: new Set<string>(),
};

export const useSessionMemory = create<SessionMemoryState>((set) => ({
  ...initialState,
  
  setTempData: (key: string, value: unknown) =>
    set((state) => ({
      tempData: { ...state.tempData, [key]: value },
    })),
  
  getTempData: (key: string) =>
    // Note: This is not ideal for a Zustand store, but works for simple retrieval
    // In practice, you might want to subscribe to specific keys
    ((state: SessionMemoryState) => state.tempData[key]),
  
  deleteTempData: (key: string) =>
    set((state) => {
      const newTempData = { ...state.tempData };
      delete newTempData[key];
      return { tempData: newTempData };
    }),
  
  clearAllTempData: () => set({ tempData: {} }),
  
  setLastGeneratedTestCase: (testCase: string | null) =>
    set({ lastGeneratedTestCase: testCase }),
  
  addToGenerationHistory: (modelUsed: string, actionCount: number) =>
    set((state) => ({
      generationHistory: [
        ...state.generationHistory,
        {
          timestamp: Date.now(),
          modelUsed,
          actionCount,
        },
      ],
    })),
  
  toggleExpandedAction: (actionId: string) =>
    set((state) => {
      const newSet = new Set(state.expandedActionIds);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return { expandedActionIds: newSet };
    }),
  
  clearExpandedActions: () => set({ expandedActionIds: new Set<string>() }),
  
  resetSessionMemory: () =>
    set({
      ...initialState,
      sessionStartTime: Date.now(),
    }),
}));
