import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Briefcase, Cpu, FileText, LayoutDashboard, Loader2, Menu, Plus, Sparkles, UserRound, X } from 'lucide-react';
import { useLive, useProfile } from '../lib/live';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { AgentPanel } from './AgentPanel';
import { NewJobModal } from './NewJobModal';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/applications', label: 'Applications', icon: Briefcase },
  { to: '/resumes', label: 'Resume library', icon: FileText },
  { to: '/profile', label: 'Profile & master', icon: UserRound },
  { to: '/settings', label: 'AI sources', icon: Cpu },
];

export function Layout() {
  const { agentOpen, setAgentOpen, tasks } = useLive();
  const { data } = useProfile();
  const [newOpen, setNewOpen] = useState(false);
  const [model, setModel] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const running = tasks.filter((t) => t.state === 'running');

  useEffect(() => {
    api.meta().then((m) => setModel(m.model)).catch(() => {});
    const t = setInterval(() => api.meta().then((m) => setModel(m.model)).catch(() => {}), 30_000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAgentOpen(!agentOpen);
      }
      if (e.key === 'Escape' && agentOpen && window.innerWidth < 1280) setAgentOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearInterval(t);
    };
  }, [agentOpen, setAgentOpen]);

  useEffect(() => setMenuOpen(false), [loc.pathname]);

  const p = data?.profile;
  const initials = (p?.name || 'You').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* ---------- phone / small tablet: top bar ---------- */}
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 bg-slate-950 px-3 text-slate-300 md:hidden">
        <button onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} className="rounded-lg p-2 hover:bg-white/10">
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Logo />
        <span className="text-sm font-semibold tracking-tight text-white">Agency</span>
        <button onClick={() => setNewOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/10">
          <Plus className="size-4" /> New role
        </button>
        {menuOpen && (
          <div className="absolute inset-x-0 top-14 border-t border-white/10 bg-slate-950 p-3 shadow-2xl">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium', isActive ? 'bg-white/10 text-white' : 'text-slate-300')}
              >
                <Icon className="size-5" />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      <nav className="hidden w-[232px] shrink-0 flex-col bg-slate-950 text-slate-300 md:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo />
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">Agency</div>
            <div className="text-[10.5px] text-slate-400">Job hunt workspace</div>
          </div>
        </div>

        <div className="px-3 pt-2">
          <button
            onClick={() => setNewOpen(true)}
            className="flex w-full items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" /> New role
            </span>
            <kbd className="rounded bg-white/10 px-1.5 text-[10px] text-slate-400">⌘K</kbd>
          </button>
        </div>

        <div className="mt-4 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="mt-6 px-3">
          <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Agent activity</div>
          {running.length === 0 ? (
            <div className="px-3 text-xs text-slate-400">Idle</div>
          ) : (
            <div className="space-y-1">
              {running.slice(0, 5).map((t) => (
                <NavLink
                  key={t.id}
                  to={t.jobId ? `/jobs/${t.jobId}` : t.kind === 'import-resume' ? '/profile' : '/'}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  <Loader2 className="size-3 shrink-0 animate-spin text-brand-400" />
                  <span className="truncate">
                    {t.title}
                    {t.jobId && <span className="text-slate-400"> · {t.jobId}</span>}
                  </span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto space-y-3 p-3">
          <button
            onClick={() => setAgentOpen(!agentOpen)}
            className={cx(
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition',
              agentOpen ? 'bg-brand-600/20 text-brand-100 ring-1 ring-inset ring-brand-500/30' : 'text-slate-300 hover:bg-white/5',
            )}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" /> Copilot
            </span>
            <kbd className="rounded bg-white/10 px-1.5 text-[10px] text-slate-400">⌘J</kbd>
          </button>
          <NavLink to="/profile" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">{initials}</div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-slate-200">{p?.name || 'Set up your profile'}</div>
              <div className="truncate text-[11px] text-slate-400">{model ? `Agent · ${model}` : p?.headline}</div>
            </div>
          </NavLink>
        </div>
      </nav>

      <main className="@container scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <Outlet context={{ openNew: () => setNewOpen(true) }} />
      </main>

      <AgentPanel />
      {!agentOpen && (
        <button
          onClick={() => setAgentOpen(true)}
          aria-label="Open copilot"
          className="fixed bottom-4 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/25 hover:bg-brand-700 md:hidden"
        >
          <Sparkles className="size-5" />
        </button>
      )}
      <NewJobModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
        <path d="M7 22l5-11 4 7 2.5-3.5L25 22" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
