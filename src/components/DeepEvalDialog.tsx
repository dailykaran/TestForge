import { useEffect, useState } from 'react';
import { X, FileText, Play, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

type Kind = 'testcase' | 'context';
type Provider = 'claude' | 'gemini';
type Picked = { name: string; preview: string } | null;

const METRICS: Array<{ id: string; label: string; needs?: 'context' | 'summary' }> = [
  { id: 'completeness', label: 'Completeness' },
  { id: 'clarity', label: 'Clarity' },
  { id: 'correctness', label: 'Correctness' },
  { id: 'format', label: 'Format' },
  { id: 'answer_relevancy', label: 'Answer relevancy', needs: 'summary' },
  { id: 'faithfulness', label: 'Faithfulness', needs: 'context' },
  { id: 'contextual_relevancy', label: 'Contextual relevancy', needs: 'context' },
];

const MODELS: Record<Provider, Array<{ id: string; label: string }>> = {
  gemini: [
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  claude: [
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
};
const CUSTOM = '__custom__';

export function DeepEvalDialog({ onClose }: { onClose: () => void }) {
  const judgeModel = useAppStore((s) => s.judgeModel);
  const [env, setEnv] = useState<{ ok: boolean; message?: string } | null>(null);
  const [files, setFiles] = useState<Record<Kind, Picked>>({ testcase: null, context: null });
  const [summary, setSummary] = useState('');
  const [provider, setProvider] = useState<Provider>(judgeModel.startsWith('claude') ? 'claude' : 'gemini');
  const [model, setModel] = useState(judgeModel);
  const [metrics, setMetrics] = useState<string[]>(['completeness', 'clarity', 'correctness', 'format']);
  const [threshold, setThreshold] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeepEvalResult | null>(null);

  const isListed = MODELS[provider].some((m) => m.id === model);

  const switchProvider = (next: Provider) => {
    setProvider(next);
    setModel(MODELS[next][0].id);
  };

  useEffect(() => {
    window.testforgeAI.deepEval.check().then(setEnv).catch((e) => setEnv({ ok: false, message: String(e) }));
    return () => {
      (['testcase', 'context'] as Kind[]).forEach((k) => window.testforgeAI.deepEval.clearFile(k));
      window.testforgeAI.deepEval.cancel();
    };
  }, []);

  const pick = async (kind: Kind) => {
    setError(null);
    try {
      const f = await window.testforgeAI.deepEval.pickFile(kind);
      if (f) setFiles((prev) => ({ ...prev, [kind]: f }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (kind: Kind) => {
    window.testforgeAI.deepEval.clearFile(kind);
    setFiles((prev) => ({ ...prev, [kind]: null }));
  };

  const toggle = (id: string) =>
    setMetrics((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const active = metrics.filter((id) => {
        const need = METRICS.find((m) => m.id === id)?.needs;
        return !need || (need === 'summary' ? summary.trim() : files.context);
      });
      setResult(await window.testforgeAI.deepEval.run({
        provider,
        model: model.trim(),
        metrics: active,
        threshold,
        hasContext: !!files.context,
        summary: summary.trim(),
      }));
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setRunning(false);
    }
  };

  const exportJson = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepeval_${result.file.replace(/\.txt$/, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const HELP: Record<Kind, string> = {
    testcase: 'The generated test case (.txt) to evaluate.',
    context: 'Reference text the generator used (requirements, spec excerpts, approved examples), e.g. "After 3 failed logins the account locks for 15 min". Enables Faithfulness and Contextual relevancy.',
  };

  const renderFilePicker = (kind: Kind, label: string, required?: boolean) => (
    <div>
      <div className="text-sm text-slate-300 mb-1">{label}{required ? ' *' : ' (optional)'}</div>
      <p className="text-xs text-slate-500 mb-2">{HELP[kind]}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => pick(kind)} disabled={running}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm">
          <FileText className="w-4 h-4" /> {files[kind] ? 'Change' : 'Choose .txt'}
        </button>
        {files[kind] && (
          <>
            <span className="text-sm text-slate-400 truncate">{files[kind]!.name}</span>
            <button onClick={() => remove(kind)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
          </>
        )}
      </div>
      {kind === 'testcase' && files.testcase && (
        <pre className="mt-2 max-h-[40vh] min-h-[8rem] overflow-auto bg-slate-950 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap">{files.testcase.preview}</pre>
      )}
    </div>
  );

  const canRun = env?.ok && files.testcase && metrics.length > 0 && model.trim() && !running;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 text-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Deep Eval — test case evaluation</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {env && !env.ok && (
          <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {env.message}
              <div className="text-xs mt-1 text-amber-400/80">
                Setup: <code>python -m venv eval/.venv</code> then <code>eval/.venv/Scripts/pip install -r eval/requirements.txt</code>
              </div>
            </div>
          </div>
        )}

        {renderFilePicker('testcase', 'Test case file', true)}
        {renderFilePicker('context', 'RAG context file')}

        <div>
          <label htmlFor="de-summary" className="text-sm text-slate-300 block mb-1">
            Test case summary (optional) — a one or two line description of what the test case should cover; enables Answer relevancy
          </label>
          <textarea id="de-summary" rows={2} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Verify a registered user can log in and reach the dashboard."
            className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm resize-y" />
        </div>

        <div>
          <div className="text-sm text-slate-300 mb-1">Judge model</div>
          <div className="inline-flex rounded-lg bg-slate-800 p-1 mb-2" role="group" aria-label="Judge provider">
            {(['gemini', 'claude'] as Provider[]).map((p) => (
              <button key={p} onClick={() => switchProvider(p)} aria-pressed={provider === p}
                className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${provider === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {p === 'gemini' ? 'Gemini' : 'Claude'}
              </button>
            ))}
          </div>
          <select value={isListed ? model : CUSTOM} onChange={(e) => setModel(e.target.value === CUSTOM ? '' : e.target.value)}
            className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm" aria-label="Judge model">
            {MODELS[provider].map((m) => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}
            <option value={CUSTOM}>Custom model ID…</option>
          </select>
          {!isListed && (
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Enter model ID" aria-label="Custom model ID"
              className="w-full mt-2 bg-slate-800 rounded-lg px-3 py-2 text-sm" />
          )}
        </div>

        <div>
          <div className="text-sm text-slate-300 mb-1">Metrics</div>
          <div className="grid grid-cols-2 gap-1">
            {METRICS.map((m) => {
              const disabled = m.needs === 'summary' ? !summary.trim() : m.needs === 'context' ? !files.context : false;
              return (
                <label key={m.id} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : ''}`}>
                  <input type="checkbox" disabled={disabled} checked={metrics.includes(m.id) && !disabled} onChange={() => toggle(m.id)} />
                  {m.label}{m.needs ? ` (needs ${m.needs})` : ''}
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm mt-2">
            Pass threshold {threshold.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-500/10 text-red-300 text-sm">{error}</div>}

        <div className="flex justify-end gap-2">
          {running && (
            <button onClick={() => window.testforgeAI.deepEval.cancel()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-sm">Cancel run</button>
          )}
          <button onClick={run} disabled={!canRun}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Evaluating…' : 'Run evaluation'}
          </button>
        </div>

        {result && <ResultsPanel result={result} onExport={exportJson} />}
      </div>
    </div>
  );
}

// Splits a judge's free-text reasoning into one bullet per sentence, keeping abbreviations like "e.g." intact.
function toBullets(text: string): string[] {
  const protectedText = text
    .replace(/\b(e\.g|i\.e|etc|vs)\./gi, (m) => m.replace(/\./g, '§'))
    .replace(/\s+/g, ' ')
    .trim();
  return protectedText
    .split(/(?<=[.!?])(?:\s+|(?<=\.)(?=[A-Z]))(?=[A-Z0-9'"(])/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);
}

const label = (metric: string) => metric.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function ResultsPanel({ result, onExport }: { result: DeepEvalResult; onExport: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const scored = result.results.filter((r) => r.score !== undefined);
  const passedCount = scored.filter((r) => r.passed).length;
  const threshold = scored[0]?.threshold;
  const toggleOpen = (metric: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(metric)) next.add(metric);
      return next;
    });
  const allOpen = open.size === result.results.length;

  return (
    <div className="space-y-3 border-t border-slate-700 pt-4">
      <div className={`rounded-xl p-4 border ${result.passed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-base">
            {result.passed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
            Overall: {result.passed ? 'Passed' : 'Failed'}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={() => setOpen(allOpen ? new Set() : new Set(result.results.map((r) => r.metric)))}
              className="text-slate-400 hover:text-slate-200">{allOpen ? 'Collapse all' : 'Expand all'}</button>
            <button onClick={onExport} className="text-blue-400 hover:underline">Export JSON</button>
          </div>
        </div>
        <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-0.5">
          {result.overallScore !== null && (
            <li>Actual overall score: <b>{result.overallScore.toFixed(2)}</b>{threshold !== undefined && <> (expected ≥ {threshold.toFixed(2)} per metric)</>}</li>
          )}
          <li>Metrics passed: <b>{passedCount}</b> of {scored.length}{scored.length < result.results.length && ` (${result.results.length - scored.length} skipped or errored)`}</li>
          <li>Judge: {result.model} ({result.provider})</li>
        </ul>
      </div>

      {result.results.map((r) => {
        const isOpen = open.has(r.metric);
        const status = r.score === undefined ? 'neutral' : r.passed ? 'pass' : 'fail';
        const tone = { pass: 'text-emerald-400', fail: 'text-red-400', neutral: 'text-slate-400' }[status];
        return (
          <div key={r.metric} className="bg-slate-800 rounded-lg text-sm">
            <button onClick={() => toggleOpen(r.metric)} aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 p-3 text-left">
              <span className="flex items-center gap-2 font-medium">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {label(r.metric)}
              </span>
              <span className={`${tone} whitespace-nowrap`}>
                {r.score !== undefined
                  ? `${r.passed ? 'Pass' : 'Fail'} · Actual ${r.score.toFixed(2)} / Expected ≥ ${r.threshold?.toFixed(2)}`
                  : r.skipped ? 'Skipped' : 'Error'}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-3">
                {r.score !== undefined && (
                  <ul className="list-disc pl-5 space-y-1 text-slate-300">
                    <li>Actual result: <b className={tone}>{r.score.toFixed(2)}</b></li>
                    <li>Expected result: score ≥ {r.threshold?.toFixed(2)}</li>
                    <li>Outcome: <b className={tone}>{r.passed ? 'Passed' : 'Failed'}</b></li>
                  </ul>
                )}
                {r.reason && (
                  <>
                    <div className="mt-2 mb-1 text-slate-300 font-medium">Judge reasoning</div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-400">
                      {toBullets(r.reason).map((point, i) => <li key={i}>{point}</li>)}
                    </ul>
                  </>
                )}
                {r.skipped && <p className="text-slate-500">Skipped: {r.skipped}</p>}
                {r.error && <p className="text-red-300">{r.error}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
