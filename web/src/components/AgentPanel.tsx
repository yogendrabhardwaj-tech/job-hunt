import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, Bot, Loader2, RotateCcw, Sparkles, Square, Wrench, X } from 'lucide-react';
import { useLive } from '../lib/live';
import { Md } from './Markdown';
import { cx } from '../lib/format';

interface Msg {
  role: 'user' | 'agent';
  text: string;
  steps: string[];
  error?: string;
  pending?: boolean;
}

const STORE_KEY = 'agency.chat.v1';

function suggestionsFor(path: string): string[] {
  if (path.startsWith('/jobs/'))
    return [
      'Tailor my resume for this role and explain the changes',
      'What are my biggest gaps here and how should I address them?',
      'Write a cover letter for this role',
      'Prep me for the interview',
    ];
  if (path.startsWith('/profile'))
    return ['Review my master resume and suggest stronger bullets', 'Optimise my LinkedIn headline and About section', 'Which of my achievements are missing from the resume?'];
  return [
    'Which applications should I prioritise this week?',
    'Summarise my pipeline and suggest next actions',
    'Find roles that fit my profile and add the best one',
  ];
}

export function AgentPanel() {
  const { agentOpen, setAgentOpen, pendingPrompt } = useLive();
  const loc = useLocation();
  const jobId = loc.pathname.match(/^\/jobs\/(J\d+)/)?.[1];
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  const [msgs, setMsgs] = useState<Msg[]>(saved.msgs ?? []);
  const [sessionId, setSessionId] = useState<string | undefined>(saved.sessionId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ msgs: msgs.filter((m) => !m.pending).slice(-40), sessionId }));
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, sessionId]);

  useEffect(() => {
    if (!pendingPrompt) return;
    if (pendingPrompt.send) send(pendingPrompt.text);
    else {
      setInput(pendingPrompt.text);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt?.n]);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((p) => [...p, { role: 'user', text: message, steps: [] }, { role: 'agent', text: '', steps: [], pending: true }]);
    abort.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, sessionId, jobId, page: loc.pathname }),
        signal: abort.current.signal,
      });
      if (!res.body) throw new Error('No response stream');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const f of frames) {
          if (!f.startsWith('data: ')) continue;
          const e = JSON.parse(f.slice(6));
          if (e.type === 'text') patchLast((m) => ({ ...m, text: m.text + e.text }));
          else if (e.type === 'tool') patchLast((m) => ({ ...m, steps: [...m.steps, e.text] }));
          else if (e.type === 'error') patchLast((m) => ({ ...m, error: e.text }));
          else if (e.type === 'session' && e.sessionId) setSessionId(e.sessionId);
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') patchLast((m) => ({ ...m, error: e.message }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  const reset = () => {
    setMsgs([]);
    setSessionId(undefined);
  };

  if (!agentOpen) return null;

  return (
    <>
    {/* below 1280px the copilot overlays the page instead of squeezing it */}
    <div className="fixed inset-0 z-30 bg-slate-900/30 xl:hidden" onClick={() => setAgentOpen(false)} aria-hidden />
    <aside
      role="complementary"
      aria-label="Agency copilot"
      className="fixed inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:w-[420px] xl:static xl:z-auto xl:w-[400px] xl:shrink-0 xl:shadow-none"
    >
      <header className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">Agency copilot</div>
            <div className="text-[11px] leading-tight text-slate-500">{jobId ? `Context: ${jobId}` : 'Can read & update your workspace'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button title="New conversation" onClick={reset} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <RotateCcw className="size-4" />
          </button>
          <button title="Close (⌘J)" onClick={() => setAgentOpen(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div ref={scroller} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="pt-6">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Bot className="size-5" />
            </div>
            <p className="text-center text-sm font-medium text-slate-800">What should I work on?</p>
            <p className="mx-auto mt-1 max-w-[280px] text-center text-xs text-slate-500">
              I can scan job links, score and tailor resumes, write cover letters, prep interviews, and update your tracker.
            </p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-[13.5px] text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {m.steps.length > 0 && (
                <div className="space-y-1">
                  {m.steps.map((s, j) => (
                    <div key={j} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Wrench className="size-3 text-brand-500" />
                      <span className="truncate">{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.text && <Md>{m.text}</Md>}
              {m.pending && !m.text && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" /> Thinking…
                </div>
              )}
              {m.error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{m.error}</div>}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-slate-100 p-3">
        {msgs.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestionsFor(loc.pathname).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left text-xs text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="relative rounded-xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder={jobId ? 'Ask about this role, or tell me what to change…' : 'Paste a job link or ask anything…'}
            className="scrollbar-thin block max-h-40 w-full resize-none rounded-xl bg-transparent px-3 py-2.5 pr-11 text-[13.5px] outline-none placeholder:text-slate-400"
          />
          <button
            onClick={() => (busy ? abort.current?.abort() : send(input))}
            className={cx(
              'absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg text-white transition',
              busy ? 'bg-slate-700' : input.trim() ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300',
            )}
          >
            {busy ? <Square className="size-3" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
