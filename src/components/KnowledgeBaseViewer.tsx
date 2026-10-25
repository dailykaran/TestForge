import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Copy, Check, ChevronLeft, ChevronRight, Loader, Layers } from 'lucide-react';

type RawChunk = { id: number; text: string; source: string; feature: string };

interface Chunk extends RawChunk {
  type: string;
  title: string;
  display: string;
  index: number;
  total: number;
}

const MAX_ROWS = 400;
const APPROVED = 'approved-test-case';

function chunkType(source: string): string {
  if (source === APPROVED) return APPROVED;
  const ext = source.includes('.') ? source.split('.').pop()!.toLowerCase() : '';
  return ext || 'other';
}

// JSON escape sequences inside string values would otherwise show up as literal "\n" text.
function unescapeJsonText(text: string): string {
  return text.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
}

function prettyJson(text: string): { value: unknown; pretty: string } | null {
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object') return null;
    return { value, pretty: unescapeJsonText(JSON.stringify(value, null, 2)) };
  } catch {
    return null;
  }
}

// Uploaded .json files are split mid-structure, so a chunk is often an invalid JSON fragment.
// Re-indent it by tracking brace depth outside of strings.
function formatJsonFragment(text: string): string {
  let out = '';
  let depth = 0;
  let inString = false;
  const pad = () => '  '.repeat(depth);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) out += text[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') { inString = true; out += ch; }
    else if (ch === '{' || ch === '[') { depth++; out += `${ch}\n${pad()}`; }
    else if (ch === '}' || ch === ']') { depth = Math.max(0, depth - 1); out += `\n${pad()}${ch}`; }
    else if (ch === ',') out += `,\n${pad()}`;
    else if (ch === ':') out += ': ';
    else if (!/\s/.test(ch)) out += ch;
  }
  return unescapeJsonText(out);
}

function deriveTitle(raw: RawChunk, type: string, parsed: { value: unknown } | null): string {
  if (parsed && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) {
    const obj = parsed.value as Record<string, unknown>;
    for (const key of ['title', 'name', 'testCaseTitle', 'id']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
    }
  }
  const firstLine = raw.text.split('\n').map((l) => l.replace(/^[#>\-*\s]+/, '').trim()).find(Boolean);
  return (firstLine ?? `${type} chunk ${raw.id}`).slice(0, 120);
}

function buildChunks(raw: RawChunk[]): Chunk[] {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  raw.forEach((r) => totals.set(r.source, (totals.get(r.source) ?? 0) + 1));
  return raw.map((r) => {
    const type = chunkType(r.source);
    const parsed = prettyJson(r.text);
    const index = (seen.get(r.source) ?? 0) + 1;
    seen.set(r.source, index);
    return {
      ...r,
      type,
      title: deriveTitle(r, type, parsed),
      display: parsed
        ? parsed.pretty
        : type === 'json' || type === APPROVED ? formatJsonFragment(r.text) : r.text,
      index,
      total: totals.get(r.source) ?? 1,
    };
  });
}

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  const lower = words.map((w) => w.toLowerCase());
  return (
    <>
      {parts.map((part, i) =>
        lower.includes(part.toLowerCase())
          ? <mark key={i} className="bg-amber-300 text-slate-900 rounded-sm">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
}

export default function KnowledgeBaseViewer({ onClose }: { onClose: () => void }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [source, setSource] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.testforgeAI.listKnowledgeChunks()
      .then((raw) => {
        if (cancelled) return;
        const built = buildChunks(raw);
        setChunks(built);
        setSelectedId(built[0]?.id ?? null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    chunks.forEach((c) => counts.set(c.type, (counts.get(c.type) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chunks]);

  const sources = useMemo(() => [...new Set(chunks.map((c) => c.source))].sort(), [chunks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chunks.filter((c) =>
      (!activeTypes.size || activeTypes.has(c.type)) &&
      (!source || c.source === source) &&
      (!q || `${c.text} ${c.title} ${c.source} ${c.feature}`.toLowerCase().includes(q)));
  }, [chunks, query, activeTypes, source]);

  const selected = chunks.find((c) => c.id === selectedId) ?? null;
  const siblings = selected ? chunks.filter((c) => c.source === selected.source) : [];
  const siblingPos = selected ? siblings.findIndex((c) => c.id === selected.id) : -1;

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (!next.delete(type)) next.add(type);
      return next;
    });
  };

  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.display);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const btn = 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-slate-600 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Knowledge base chunks"
      >
        <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-700">
          <Layers className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Knowledge Base Chunks</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search text, title, source, feature"
              className="bg-slate-800 border border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-sm w-72 focus:outline-none focus:border-blue-400"
            />
          </div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm max-w-xs"
          >
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s || '(unknown)'}</option>)}
          </select>
          <span className="flex-1" />
          <span className="text-sm text-slate-400">{filtered.length} / {chunks.length} chunks</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex flex-wrap gap-2 px-5 py-2 border-b border-slate-700">
          {typeCounts.map(([type, count]) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-3 py-0.5 rounded-full text-xs border ${activeTypes.has(type)
                ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                : 'border-slate-600 text-slate-300 hover:border-slate-400'}`}
            >
              {type}<span className="ml-1.5 text-slate-500">{count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 gap-2"><Loader className="w-4 h-4 animate-spin" /> Loading chunks...</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-300 p-6">{error}</div>
        ) : chunks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">The knowledge base is empty.</div>
        ) : (
          <div className="flex-1 grid grid-cols-[minmax(300px,420px)_1fr] min-h-0">
            <div className="overflow-auto border-r border-slate-700">
              {filtered.slice(0, MAX_ROWS).map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`px-4 py-2.5 border-b border-slate-800 cursor-pointer hover:bg-slate-800 ${c.id === selectedId ? 'bg-slate-800' : ''}`}
                >
                  <div className="font-medium text-sm truncate"><Highlight text={c.title} query={query} /></div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                    <span className="px-1.5 rounded bg-blue-500/20 text-blue-300">{c.type}</span>
                    <span className="truncate max-w-[180px]">{c.source || '(unknown)'}</span>
                    {c.feature && <span>{c.feature}</span>}
                    <span>{c.text.length} chars</span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="p-8 text-center text-slate-500">No chunks match.</div>}
              {filtered.length > MAX_ROWS && (
                <div className="p-4 text-center text-xs text-slate-500">Showing first {MAX_ROWS}. Narrow the filters.</div>
              )}
            </div>

            <div className="overflow-auto p-6">
              {selected ? (
                <>
                  <h3 className="text-lg font-semibold break-words">{selected.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 my-3">
                    <button onClick={copy} className={btn}>
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => { setSource(selected.source); setActiveTypes(new Set()); }} className={btn}>
                      Show whole source
                    </button>
                    <button
                      onClick={() => setSelectedId(siblings[siblingPos - 1].id)}
                      disabled={siblingPos <= 0}
                      className={btn}
                    ><ChevronLeft className="w-4 h-4" />Prev</button>
                    <button
                      onClick={() => setSelectedId(siblings[siblingPos + 1].id)}
                      disabled={siblingPos < 0 || siblingPos >= siblings.length - 1}
                      className={btn}
                    >Next<ChevronRight className="w-4 h-4" /></button>
                    <span className="text-xs text-slate-500">{siblingPos + 1}/{siblings.length} in source</span>
                  </div>
                  <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm mb-4">
                    <dt className="text-slate-500">type</dt><dd>{selected.type}</dd>
                    <dt className="text-slate-500">source</dt><dd className="break-words">{selected.source || '-'}</dd>
                    <dt className="text-slate-500">feature</dt><dd>{selected.feature || '-'}</dd>
                    <dt className="text-slate-500">chunk</dt><dd>{selected.index} of {selected.total}</dd>
                    <dt className="text-slate-500">size</dt><dd>{selected.text.length} characters</dd>
                  </dl>
                  <pre className="whitespace-pre-wrap break-words bg-slate-950 border border-slate-700 rounded-lg p-4 text-[13px] leading-relaxed font-mono">
                    <Highlight text={selected.display} query={query} />
                  </pre>
                </>
              ) : (
                <div className="text-slate-500 text-center mt-10">Select a chunk on the left.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
