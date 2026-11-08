import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, ExternalLink, KeyRound, Pencil, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/Layout';
import { Button, Card, SectionTitle, Skeleton, inputCls } from '../components/ui';
import { cx, timeAgo } from '../lib/format';
import type { AISettings, ModelInfo, ProviderConfig, ProviderKind } from '../lib/types';

const ADDABLE: ProviderKind[] = ['openrouter', 'huggingface', 'google', 'lmstudio', 'openai-compatible', 'claude'];

type Draft = Partial<ProviderConfig> & { kind: ProviderKind; apiKey?: string };

export function SettingsPage() {
  const [s, setS] = useState<AISettings>();
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState<ProviderKind | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = () => api.settings().then(setS).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    // usage counters and pauses change as agents run
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const act = async (fn: () => Promise<AISettings>) => {
    setErr('');
    try {
      setS(await fn());
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    }
  };

  if (!s)
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8" aria-busy="true">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <Skeleton className="mt-8 h-28 w-full" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );

  const order = s.providers.map((p) => p.id);
  const move = (id: string, d: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    act(() => api.saveSettings({ order }));
  };
  const primary = s.providers.filter((p) => !p.fallbackOnly && p.availability.ok);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-8">
      <PageHeader
        title="AI sources"
        sub="The models that scan postings, score matches and write resumes. Runs are shared across the sources you turn on. If one is rate-limited or fails, the next one takes over."
      />

      {err && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {err}
        </div>
      )}

      <Card className="mb-6 p-5">
        <SectionTitle>How runs are shared</SectionTitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Routing strategy">
          {(
            [
              ['balanced', 'Balanced', 'Each run goes to the source with the least use today, relative to its weight.'],
              ['priority', 'Priority order', 'Always use the top source; move down the list only when it is paused or fails.'],
            ] as const
          ).map(([id, label, body]) => (
            <button
              key={id}
              role="radio"
              aria-checked={s.strategy === id}
              onClick={() => act(() => api.saveSettings({ strategy: id }))}
              className={cx(
                'rounded-lg p-3 text-left ring-1 ring-inset transition',
                s.strategy === id ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50',
              )}
            >
              <div className="text-sm font-semibold text-slate-900">{label}</div>
              <div className="mt-0.5 text-xs text-slate-600">{body}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {primary.length
            ? `${primary.length} source${primary.length > 1 ? 's' : ''} ready. Sources marked “fallback only” run only when all of these are unavailable.`
            : 'No free source is ready yet, so every run goes to a fallback source. Add one below.'}{' '}
          Prompts for tailoring are about 15–20k tokens, so pick models with a context window of at least 32k.
        </p>
      </Card>

      <SectionTitle className="mb-3">Sources</SectionTitle>
      <div className="space-y-3">
        {s.providers.map((p, i) =>
          editing === p.id ? (
            <SourceEditor
              key={p.id}
              settings={s}
              initial={{ ...p, apiKey: '' }}
              onCancel={() => setEditing(null)}
              onSave={async (d) => {
                if (await act(() => api.updateSource(p.id, d))) setEditing(null);
              }}
            />
          ) : (
            <SourceRow
              key={p.id}
              p={p}
              s={s}
              first={i === 0}
              last={i === s.providers.length - 1}
              onMove={(d) => move(p.id, d)}
              onEdit={() => setEditing(p.id)}
              onToggle={() => act(() => api.updateSource(p.id, { enabled: !p.enabled }))}
              onDelete={() => confirm(`Remove ${p.name}?`) && act(() => api.deleteSource(p.id))}
              onTested={load}
            />
          ),
        )}

        {adding && (
          <SourceEditor
            settings={s}
            initial={{ kind: adding, name: s.presets[adding].label, baseUrl: s.presets[adding].baseUrl, weight: adding === 'lmstudio' ? 3 : 1, maxTokens: 8192, dailyLimit: 0, enabled: true, fallbackOnly: adding === 'claude' }}
            onCancel={() => setAdding(null)}
            onSave={async (d) => {
              if (await act(() => api.addSource(d))) setAdding(null);
            }}
          />
        )}
      </div>

      <Card className="mt-4 p-4">
        <div className="text-sm font-medium text-slate-800">Add a source</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ADDABLE.map((k) => (
            <Button key={k} size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(k)} disabled={!!adding}>
              {s.presets[k].label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          You can add the same service more than once with different models. Accounts share one rate limit, so two OpenRouter models on one key still count against the same daily cap.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- one source

function SourceRow({
  p,
  s,
  first,
  last,
  onMove,
  onEdit,
  onToggle,
  onDelete,
  onTested,
}: {
  p: ProviderConfig;
  s: AISettings;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onTested: () => void;
}) {
  const [test, setTest] = useState<Awaited<ReturnType<typeof api.testSource>> | 'running' | null>(null);
  const u = p.usage;
  const tokens = u.promptTokens + u.completionTokens;

  const runTest = async () => {
    setTest('running');
    try {
      setTest(await api.testSource(p.id));
    } catch (e: any) {
      setTest({ ok: false, toolCalling: false, latencyMs: 0, error: e.message });
    }
    onTested();
  };

  return (
    <Card className={cx('p-4', !p.enabled && 'bg-slate-50/60')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col">
          <button aria-label={`Move ${p.name} up`} disabled={first} onClick={() => onMove(-1)} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button aria-label={`Move ${p.name} down`} disabled={last} onClick={() => onMove(1)} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
        </div>

        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{p.name}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{s.presets[p.kind].label}</span>
            {p.fallbackOnly && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Fallback only</span>}
            <Availability p={p} />
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-slate-600">{p.model || '— no model set —'}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              Today: <b className="font-semibold tabular-nums text-slate-800">{u.runs}</b> run{u.runs === 1 ? '' : 's'}
              {p.dailyLimit ? ` of ${p.dailyLimit}` : ''}
            </span>
            <span className="tabular-nums">{u.requests} requests</span>
            {tokens > 0 && <span className="tabular-nums">{tokens.toLocaleString()} tokens</span>}
            {u.failures > 0 && <span className="tabular-nums text-rose-700">{u.failures} failed</span>}
            {s.strategy === 'balanced' && !p.fallbackOnly && <span>Weight {p.weight}</span>}
            {u.lastUsed && <span>Last used {timeAgo(u.lastUsed)}</span>}
          </div>
          {u.lastError && (
            <p className="mt-1.5 line-clamp-2 text-xs text-rose-700" title={u.lastError}>
              Last error{u.lastErrorAt ? ` (${timeAgo(u.lastErrorAt)})` : ''}: {u.lastError}
            </p>
          )}
          {test && test !== 'running' && (
            <p className={cx('mt-1.5 text-xs', test.ok && test.toolCalling ? 'text-emerald-700' : test.ok ? 'text-amber-700' : 'text-rose-700')}>
              {test.ok
                ? test.toolCalling
                  ? `✓ Works, including tool calls (${(test.latencyMs / 1000).toFixed(1)} s): ${test.reply}`
                  : `Answers, but did not call the tool. This model probably can't save results; pick one that supports tools. Reply: ${test.reply}`
                : `✗ ${test.error}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {p.kind !== 'claude' && (
            <Button size="sm" variant="ghost" onClick={runTest} loading={test === 'running'} icon={<Zap className="size-3.5" />}>
              Test
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} icon={<Pencil className="size-3.5" />}>
            Edit
          </Button>
          <button aria-label={`Remove ${p.name}`} onClick={onDelete} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700">
            <Trash2 className="size-4" />
          </button>
          <Switch on={p.enabled} onClick={onToggle} label={`${p.enabled ? 'Turn off' : 'Turn on'} ${p.name}`} />
        </div>
      </div>
    </Card>
  );
}

function Availability({ p }: { p: ProviderConfig }) {
  if (p.availability.ok)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <CircleCheck className="size-3" /> Ready
      </span>
    );
  if (!p.enabled) return <span className="text-[11px] font-medium text-slate-500">Off</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
      <CircleAlert className="size-3" /> {p.availability.reason}
    </span>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cx('relative ml-1 h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-brand-600' : 'bg-slate-300')}
    >
      <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

// ---------------------------------------------------------------- add / edit form

function SourceEditor({ settings, initial, onSave, onCancel }: { settings: AISettings; initial: Draft; onSave: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsErr, setModelsErr] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const preset = settings.presets[d.kind];
  const saved = settings.providers.find((p) => p.id === initial.id);
  const isClaude = d.kind === 'claude';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const loadModels = async () => {
    setLoadingModels(true);
    setModelsErr('');
    try {
      setModels(await api.models({ id: initial.id, kind: d.kind, baseUrl: d.baseUrl, apiKey: d.apiKey }));
    } catch (e: any) {
      setModelsErr(e.message);
    }
    setLoadingModels(false);
  };

  const picked = models?.find((m) => m.id === d.model);
  const listId = `models-${initial.id ?? 'new'}`;

  return (
    <Card className="p-5 ring-2 ring-brand-500/40">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{initial.id ? `Edit ${initial.name}` : `Add ${preset.label}`}</div>
        {preset.keyUrl && (
          <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <KeyRound className="size-3.5" /> Get a free key <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">{preset.note}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} className={inputCls} />
        </Field>
        {!isClaude && (
          <Field label="Base URL">
            <input value={d.baseUrl ?? ''} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://…/v1" className={inputCls + ' font-mono text-[12.5px]'} />
          </Field>
        )}
        {!isClaude && (
          <Field label={preset.needsKey ? 'API key' : 'API key (optional)'}>
            <input
              type="password"
              autoComplete="off"
              value={d.apiKey ?? ''}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder={saved?.apiKeySet ? `Saved (${saved.apiKeyHint}). Leave empty to keep it` : preset.needsKey ? 'Paste your key' : 'Not needed for local servers'}
              className={inputCls + ' font-mono text-[12.5px]'}
            />
          </Field>
        )}
        <Field label="Model" className={isClaude ? '' : 'sm:col-span-2'}>
          <div className="flex gap-2">
            <input
              list={listId}
              value={d.model ?? ''}
              onChange={(e) => set('model', e.target.value)}
              placeholder={preset.modelHint}
              className={inputCls + ' font-mono text-[12.5px]'}
            />
            {!isClaude && (
              <Button type="button" onClick={loadModels} loading={loadingModels} icon={<RefreshCw className="size-3.5" />}>
                Load models
              </Button>
            )}
          </div>
          <datalist id={listId}>
            {models?.map((m) => (
              <option key={m.id} value={m.id}>
                {[m.tools === true ? 'tools' : m.tools === false ? 'no tools' : '', m.context ? `${Math.round(m.context / 1000)}k context` : ''].filter(Boolean).join(' · ')}
              </option>
            ))}
          </datalist>
          {modelsErr && <p className="mt-1 text-xs text-rose-700">{modelsErr}</p>}
          {models && !modelsErr && (
            <p className="mt-1 text-xs text-slate-500">
              {models.length} model{models.length === 1 ? '' : 's'} found
              {d.kind === 'openrouter' ? ' (free only)' : ''}. Click the field to pick one.
              {picked?.tools === false && <span className="text-amber-700"> This model doesn't support tool calls, so it can't save results.</span>}
              {picked?.context && picked.context < 32000 && <span className="text-amber-700"> Its {Math.round(picked.context / 1000)}k context may be too small for tailoring.</span>}
            </p>
          )}
        </Field>
        {!isClaude && (
          <>
            <Field label="Weight (1–10)" hint="Share of runs in balanced mode">
              <input type="number" min={1} max={10} value={d.weight ?? 1} onChange={(e) => set('weight', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Daily run limit" hint="0 = no limit">
              <input type="number" min={0} value={d.dailyLimit ?? 0} onChange={(e) => set('dailyLimit', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Max output tokens" hint="A full tailored resume needs about 4–6k">
              <input type="number" min={512} step={512} value={d.maxTokens ?? 8192} onChange={(e) => set('maxTokens', Number(e.target.value))} className={inputCls} />
            </Field>
          </>
        )}
        <label className="flex items-start gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!d.fallbackOnly} onChange={(e) => set('fallbackOnly', e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            Fallback only
            <span className="block text-xs text-slate-500">Use only when every other source is unavailable.</span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(d);
            setSaving(false);
          }}
        >
          {initial.id ? 'Save' : 'Add source'}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {hint && <span className="font-normal text-slate-500"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}
