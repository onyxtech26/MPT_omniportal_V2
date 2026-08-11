'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Send, Loader2, AlertCircle, Database, ChevronDown, User, Trash2,
} from 'lucide-react';
import { apiErrorMessage } from '@/lib/apiError';
import { CHAT_STORAGE_KEY } from '@/lib/chatStorage';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Turn {
  question: string;
  answer?: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
}

// Kept in step with ChatRequest in backend/main.py.
const MIN_QUESTION = 3;
const MAX_QUESTION = 500;

const SUGGESTIONS = [
  'Which branch had the highest revenue?',
  'Top 5 brands by units sold',
  'Compare Casio sales across branches',
  'Which month had the most transactions?',
];

const SQL_CLAUSES =
  /\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION ALL|UNION|LEFT JOIN|INNER JOIN|JOIN|WITH)\b/gi;

/** Lay a one-line query out over several lines so it can be read without
 *  scrolling sideways. Commas are only broken at the top level — splitting
 *  inside round(sum(...), 2) would mangle the expression. */
function formatSql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  const clauses = oneLine.replace(SQL_CLAUSES, '\n$1');

  return clauses
    .split('\n')
    .map((line) => {
      let depth = 0;
      let out = '';
      for (const ch of line) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        out += ch;
        if (ch === ',' && depth === 0) out += '\n  ';
      }
      return out;
    })
    .join('\n')
    .replace(/\n\s*\n/g, '\n')
    .replace(/,\n\s+$/g, ',');
}

/** Render **bold** rather than printing the asterisks.
 *  The model is told to write plain text, but it reaches for markdown anyway,
 *  and raw ** in an answer looks like a bug to whoever is reading it. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )}
    </>
  );
}

/** Shows the query the assistant wrote and the rows it read. */
function Evidence({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  if (!turn.sql) return null;

  const columns = turn.rows?.length ? Object.keys(turn.rows[0]) : [];

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        How I got this
        {turn.rowCount !== undefined && (
          <span className="font-medium text-slate-400">
            · {turn.rowCount} row{turn.rowCount === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Wrapped, not side-scrolled: a query you have to drag to read is
              no use in a demo. */}
          <pre className="text-xs bg-slate-900 text-slate-100 rounded-[16px] p-4 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {formatSql(turn.sql)}
          </pre>
          {columns.length > 0 && (
            <>
              {/* Bounded so a long result set cannot push the page away. */}
              <div className="overflow-auto max-h-64 rounded-[16px] border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {columns.map((c) => (
                        <th key={c} className="text-left font-bold text-slate-600 px-3 py-2 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {turn.rows!.slice(0, 25).map((row, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        {columns.map((c) => (
                          <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(turn.rowCount ?? 0) > Math.min(turn.rows!.length, 25) && (
                <p className="text-xs text-slate-400 font-medium">
                  Showing {Math.min(turn.rows!.length, 25)} of {turn.rowCount} rows.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; queryable: boolean; model: string | null } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const skipFirstSave = useRef(true);

  // Restore the conversation. Navigating away unmounts this page, so without
  // this the history is lost the moment you visit the dashboard and return.
  // Restoring after mount (rather than in useState) keeps the server-rendered
  // markup and the first client render identical.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved));
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
  }, []);

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;   // don't overwrite storage before restore
      return;
    }
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(turns));
    } catch {
      /* quota or private mode — history just won't survive navigation */
    }
  }, [turns]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/');
      return;
    }
    fetch(`${BACKEND}/api/chat/status`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isAsking]);

  const ask = async (text: string) => {
    const q = text.trim();
    // Mirrors the server's own length bounds so a too-short question is a
    // no-op here rather than a validation error round-trip.
    if (q.length < MIN_QUESTION || q.length > MAX_QUESTION || isAsking) return;

    setQuestion('');
    setIsAsking(true);
    setTurns((prev) => [...prev, { question: q }]);

    try {
      // Send the recent exchange so follow-ups resolve ("what about JCI?").
      const history = turns
        .filter((t) => t.answer)
        .slice(-4)
        .map((t) => ({ question: t.question, answer: t.answer ?? '' }));

      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ question: q, history }),
      });

      if (res.status === 401) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        router.push('/');
        return;
      }

      const data = await res.json();
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = res.ok
          ? { question: q, answer: data.answer, sql: data.sql, rows: data.rows, rowCount: data.rowCount }
          : { question: q, error: apiErrorMessage(data, 'Could not answer that.') };
        return next;
      });
    } catch (err) {
      const offline = err instanceof TypeError;
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          question: q,
          error: offline ? 'Backend is offline.' : 'Something went wrong.',
        };
        return next;
      });
    } finally {
      setIsAsking(false);
    }
  };

  const unavailable = status && (!status.configured || !status.queryable);

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
            <Sparkles className="text-slate-400" size={36} />
            Ask the Data
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Ask a question in plain English. The assistant queries the sales database and shows the SQL it used.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            onClick={() => setTurns([])}
            className="shrink-0 mt-2 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
            Clear chat
          </button>
        )}
      </header>

      {unavailable && (
        <div className="mb-6 p-4 text-sm text-amber-700 bg-amber-50 rounded-[20px] border border-amber-100 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            {!status?.configured
              ? 'The assistant needs an API key. Add NVIDIA_API_KEY to backend/.env and restart the backend.'
              : 'The assistant answers by querying the database. Set DATA_SOURCE=supabase in backend/.env to enable it.'}
          </span>
        </div>
      )}

      {turns.length === 0 && (
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={!!unavailable}
              className="text-left px-4 py-3 rounded-[20px] bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-5">
        <AnimatePresence initial={false}>
          {turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-start gap-3 justify-end">
                <div className="bg-[#0f172a] text-white rounded-[20px] px-5 py-3 max-w-[80%]">
                  <p className="text-sm font-medium leading-relaxed">{turn.question}</p>
                </div>
                <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-1">
                  <User size={15} />
                </span>
              </div>

              {(turn.answer || turn.error) && (
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 mt-1">
                    <Sparkles size={15} />
                  </span>
                  <div
                    className={`rounded-[24px] px-5 py-4 flex-1 min-w-0 border ${
                      turn.error
                        ? 'bg-red-50 border-red-100'
                        : 'bg-white border-slate-100 shadow-sm'
                    }`}
                  >
                    {turn.error ? (
                      <p className="text-sm text-red-600 font-medium">{turn.error}</p>
                    ) : (
                      <>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          <RichText text={turn.answer ?? ''} />
                        </p>
                        <Evidence turn={turn} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isAsking && (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Sparkles size={15} />
            </span>
            <span className="text-sm font-medium flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Querying the database…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-4 mt-8">
        <div className="flex gap-2 bg-white rounded-[24px] border border-slate-200 shadow-lg shadow-slate-900/5 p-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(question); }}
            placeholder="Ask about branches, brands, salespeople, months…"
            disabled={!!unavailable || isAsking}
            maxLength={MAX_QUESTION}
            className="flex-1 px-4 py-3 bg-transparent focus:outline-none text-slate-900 font-medium text-sm disabled:cursor-not-allowed"
          />
          <button
            onClick={() => ask(question)}
            disabled={!!unavailable || isAsking || question.trim().length < MIN_QUESTION}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-[#0f172a] text-white rounded-[18px] hover:bg-slate-800 transition-colors font-semibold text-sm cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        {status?.model && (
          <p className="text-xs text-slate-400 font-medium mt-2 ml-2 flex items-center gap-1.5">
            <Database size={12} />
            Reads the sales database directly · {status.model}
          </p>
        )}
      </div>
    </div>
  );
}
