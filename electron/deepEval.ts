import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getClaudeApiKey, getGeminiApiKey } from './keyStore';

type Provider = 'claude' | 'gemini';
type PickKind = 'testcase' | 'context';

const MAX_FILE_BYTES = 200_000;
const TIMEOUT_MS = 5 * 60_000;
const METRICS = new Set([
  'completeness', 'clarity', 'correctness', 'format',
  'answer_relevancy', 'faithfulness', 'contextual_relevancy',
]);

// Only paths chosen through the native dialog can be evaluated; the renderer never supplies raw paths.
const pickedPaths = new Map<string, string>();
let activeRun: ChildProcess | null = null;

function evalDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'eval') : path.join(app.getAppPath(), 'eval');
}

function pythonExecutable(): string {
  if (process.env.TESTFORGE_PYTHON) return process.env.TESTFORGE_PYTHON;
  const venvPython = process.platform === 'win32'
    ? path.join(evalDir(), '.venv', 'Scripts', 'python.exe')
    : path.join(evalDir(), '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) return venvPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runPython(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable(), ['run_eval.py', ...args], {
      cwd: evalDir(),
      env: { ...process.env, ...env, PYTHONIOENCODING: 'utf-8', DEEPEVAL_TELEMETRY_OPT_OUT: 'YES' },
      windowsHide: true,
    });
    activeRun = child;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); activeRun = null; reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (activeRun === child) activeRun = null;
      resolve({ stdout, stderr, code });
    });
  });
}

function lastJsonLine(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('{')) return JSON.parse(lines[i]);
  }
  throw new Error('The evaluator returned no result.');
}

function resolvePicked(id: unknown): string {
  const p = typeof id === 'string' ? pickedPaths.get(id) : undefined;
  if (!p) throw new Error('Select the file again.');
  return p;
}

export function setupDeepEvalHandlers() {
  ipcMain.handle('deepeval:check', async () => {
    try {
      const { stdout, stderr, code } = await runPython(['--check']);
      if (code !== 0) return { ok: false, message: stderr.trim().split('\n').pop() || 'DeepEval is not installed.' };
      return lastJsonLine(stdout);
    } catch {
      return { ok: false, message: 'Python was not found. Install Python 3.9+ or set TESTFORGE_PYTHON.' };
    }
  });

  ipcMain.handle('deepeval:pick-file', async (event, kind: PickKind) => {
    if (!['testcase', 'context'].includes(kind)) throw new Error('Invalid file kind.');
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Text files', extensions: ['txt'] }],
    };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const res = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const selected = res.filePaths[0];
    if (res.canceled || !selected) return null;
    const stat = fs.statSync(selected);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('The file must be a .txt file of 200 KB or less.');
    pickedPaths.set(kind, selected);
    return { name: path.basename(selected), preview: fs.readFileSync(selected, 'utf8') };
  });

  ipcMain.handle('deepeval:run', async (_, req: {
    provider: Provider; model: string; metrics: string[]; threshold: number;
    hasContext?: boolean; summary?: string;
  }) => {
    if (activeRun) throw new Error('An evaluation is already running.');
    if (req?.provider !== 'claude' && req?.provider !== 'gemini') throw new Error('Invalid judge provider.');
    const model = String(req.model ?? '').trim();
    if (!/^[\w.\-:/]{1,100}$/.test(model)) throw new Error('Invalid judge model ID.');
    const metrics = (req.metrics ?? []).filter((m) => METRICS.has(m));
    if (metrics.length === 0) throw new Error('Select at least one metric.');
    const threshold = Math.min(1, Math.max(0, Number(req.threshold) || 0.5));

    const apiKey = req.provider === 'claude' ? await getClaudeApiKey() : await getGeminiApiKey();
    if (!apiKey) throw new Error(`Add a ${req.provider === 'claude' ? 'Claude' : 'Gemini'} API key in Settings.`);

    const args = ['--file', resolvePicked('testcase'), '--provider', req.provider, '--model', model,
      '--metrics', metrics.join(','), '--threshold', String(threshold)];
    if (req.hasContext) args.push('--context', resolvePicked('context'));
    const summary = typeof req.summary === 'string' ? req.summary.trim().slice(0, 1000) : '';
    if (summary) args.push('--input-text', summary);

    const env = req.provider === 'claude' ? { ANTHROPIC_API_KEY: apiKey } : { GOOGLE_API_KEY: apiKey };
    const { stdout, stderr, code } = await runPython(args, env);
    if (code !== 0) {
      throw new Error(stderr.trim().split('\n').pop()?.replace(apiKey, '***') || 'Evaluation failed or was cancelled.');
    }
    return lastJsonLine(stdout);
  });

  ipcMain.handle('deepeval:cancel', () => {
    activeRun?.kill();
    return { cancelled: true };
  });

  ipcMain.handle('deepeval:clear-file', (_, kind: string) => {
    pickedPaths.delete(kind);
    return true;
  });
}
