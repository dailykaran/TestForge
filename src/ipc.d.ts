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

  interface DeepEvalMetricResult {
    metric: string;
    score?: number;
    threshold?: number;
    passed?: boolean;
    reason?: string | null;
    skipped?: string;
    error?: string;
  }

  interface DeepEvalResult {
    file: string;
    provider: string;
    model: string;
    results: DeepEvalMetricResult[];
    overallScore: number | null;
    passed: boolean;
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
      }) => Promise<TestForgeTestCase[] | string>;
      onProgress: (callback: (node: string) => void) => () => void;
      addKnowledgeFiles: () => Promise<{ added: number }>;
      knowledgeCount: () => Promise<number>;
      listKnowledgeChunks: () => Promise<Array<{ id: number; text: string; source: string; feature: string }>>;
      clearKnowledgeBase: () => Promise<{ cleared: boolean }>;
      ingestApprovedCases: (cases: Array<TestForgeTestCase | string>, feature: string) => Promise<{ added: number }>;
      getContextPromptInfo: () => Promise<{ filename: string | null; exists: boolean }>;
      uploadContextPrompt: () => Promise<{ filename: string | null }>;
      clearContextPrompt: () => Promise<{ cleared: boolean }>;
      deepEval: {
        check: () => Promise<{ ok: boolean; deepeval?: string; message?: string }>;
        pickFile: (kind: 'testcase' | 'context') => Promise<{ name: string; preview: string } | null>;
        clearFile: (kind: 'testcase' | 'context') => Promise<boolean>;
        run: (req: {
          provider: 'claude' | 'gemini';
          model: string;
          metrics: string[];
          threshold: number;
          hasContext?: boolean;
          summary?: string;
        }) => Promise<DeepEvalResult>;
        cancel: () => Promise<{ cancelled: boolean }>;
      };
    };
  }
}

export {};
