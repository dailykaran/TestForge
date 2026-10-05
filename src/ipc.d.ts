declare global {
  interface TestForgeTestCase {
    id: string;
    title: string;
    priority: 'High' | 'Medium' | 'Low';
    type: 'Functional' | 'Negative' | 'Boundary' | 'UI';
    preconditions: string[];
    setupSteps: string[];
    actionSteps: string[];
    cleanupSteps: string[];
    expectedResult: string;
  }

  interface Window {
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
        send: (channel: string, ...args: unknown[]) => void;
    };
    testforgeAI: {
      generate: (payload: {
        actions: import('./types').ActionEvent[];
        screenshots: string[];
        provider: 'claude' | 'gemini';
        model: string;
        judgeProvider: 'claude' | 'gemini';
        judgeModel: string;
        useRag: boolean;
        useUploadedPrompt?: boolean;
        testCaseSummary?: string;
      }) => Promise<TestForgeTestCase[]>;
      onProgress: (callback: (node: string) => void) => () => void;
      addKnowledgeFiles: () => Promise<{ added: number }>;
      knowledgeCount: () => Promise<number>;
      clearKnowledgeBase: () => Promise<{ cleared: boolean }>;
      ingestApprovedCases: (cases: TestForgeTestCase[], feature: string) => Promise<{ added: number }>;
      getContextPromptInfo: () => Promise<{ filename: string | null; exists: boolean }>;
      uploadContextPrompt: () => Promise<{ filename: string | null }>;
      clearContextPrompt: () => Promise<{ cleared: boolean }>;
    };
  }
}

export {};
