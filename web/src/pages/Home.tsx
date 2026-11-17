import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CirclePlay, Lock, Mail, Pause, Play, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/auth';
import { BrandMark, ThemeSwitcher } from '../components/ThemeSwitcher';

// ---------------------------------------------------------------- type helpers

const display = "font-['Inter_Tight',Inter,ui-sans-serif,sans-serif]";
const serif = "font-['Instrument_Serif',Georgia,serif] italic font-normal";
const mono = "font-['JetBrains_Mono',ui-monospace,monospace]";
const eyebrow = `${mono} text-xs tracking-[0.12em] text-(--jha-acc-light)`;
const h2 = `${display} mt-4 text-[clamp(32px,4.4vw,56px)] font-semibold leading-[1.02] tracking-[-0.04em] text-white`;
const gradientText: CSSProperties = {
  background: 'linear-gradient(100deg, var(--jha-pale) 10%, var(--jha-acc-light) 45%, var(--jha-sec-light) 90%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};
const primaryBtn: CSSProperties = {
  background: 'linear-gradient(180deg, var(--jha-acc-light), var(--jha-acc))',
  boxShadow: '0 8px 24px -8px var(--jha-glow), inset 0 1px 0 rgba(255,255,255,0.3)',
};

/** Public home page for signed-out visitors: what the app does, plus sign-in and sign-up. */
export function HomePage() {
  const [freeModels, setFreeModels] = useState(false);
  useEffect(() => {
    auth.config().then((c) => setFreeModels(c.freeModels)).catch(() => {});
  }, []);

  return (
    <div
      className="jha-home min-h-screen overflow-hidden bg-[#05070f] font-sans text-[#c4cbe0] antialiased"
    >
      {/* ============================================================ hero + header */}
      <div className="relative">
        <div aria-hidden className="jha-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[260px] left-1/2 h-[760px] w-[1100px] -translate-x-1/2 opacity-55"
          style={{ background: 'radial-gradient(closest-side, var(--jha-glow), transparent)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[200px] top-[380px] size-[620px]"
          style={{ background: 'radial-gradient(closest-side, rgba(var(--jha-sec-rgb),0.22), transparent)' }}
        />

        <header className="relative">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-[18px]">
            <div className="flex min-w-max flex-1 basis-0 justify-start">
              <Link to="/" className="flex items-center gap-2.5 text-white">
                <BrandMark className="size-[34px] rounded-[10px]" />
                <span className={`${display} text-[17px] font-semibold tracking-[-0.01em]`}>Job Hunt Alpha</span>
              </Link>
            </div>
            <nav
              aria-label="Main"
              className="jha-glass hidden flex-wrap items-center gap-x-[22px] md:flex gap-y-0.5 rounded-full border border-white/8 px-[22px] text-sm font-medium"
            >
              {[
                ['#features', 'Features'],
                ['#how', 'How it works'],
                ['#truthful', 'Honesty rule'],
                ['#ai', 'AI models'],
              ].map(([href, label]) => (
                <a key={href} href={href} className="py-3 text-[#a3acc2] transition-colors hover:text-white">
                  {label}
                </a>
              ))}
            </nav>
            <div className="flex min-w-max flex-1 basis-0 items-center justify-end gap-2">
              <Link to="/login" className="inline-flex h-11 items-center px-3.5 text-sm font-medium text-[#c4cbe0] transition-colors hover:text-white">
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-11 items-center rounded-full border border-white/16 bg-white/8 px-[18px] text-sm font-semibold text-white transition hover:border-white/28 hover:bg-white/12"
              >
                Create account
              </Link>
              <ThemeSwitcher className="ml-1.5" />
            </div>
          </div>
        </header>

        <section className="relative">
          <div className="mx-auto max-w-[1200px] px-6 pt-6 text-center">
            <HeroCarousel freeModels={freeModels} />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className="jha-btn inline-flex h-[54px] items-center gap-2.5 rounded-full px-[26px] text-base font-semibold text-white" style={primaryBtn}>
                Get started free <ArrowRight className="size-[18px]" aria-hidden />
              </Link>
              <a
                href="#how"
                className="inline-flex h-[54px] items-center gap-2.5 rounded-full border border-white/16 px-6 text-base font-medium text-[#e2e8f0] transition hover:border-white/28 hover:bg-white/6"
              >
                <CirclePlay className="size-[18px]" aria-hidden /> See how it works
              </a>
            </div>
            <p className="mt-3.5 text-[13px] text-[#7c87a3]">No password: sign in with a link we email you.</p>
          </div>

          <ProductWindow />
        </section>

        <div className="relative mx-auto max-w-[1200px] px-6 pt-[88px]">
          <div className={`${display} flex flex-wrap items-center justify-center gap-x-11 gap-y-3.5 text-lg font-semibold tracking-[-0.01em] text-[#5d6884]`}>
            <span className={`${mono} text-[11px] font-normal tracking-[0.1em] text-[#7c87a3]`}>READS POSTINGS FROM</span>
            <span>Greenhouse</span>
            <span>Lever</span>
            <span>Company career pages</span>
            <span>Pasted descriptions</span>
          </div>
        </div>
      </div>

      <main>
        <Features />
        <HowItWorks />
        <HonestyRule />
        <AiSources freeModels={freeModels} />
        <FinalCta />
      </main>

      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-7 text-sm text-[#7c87a3]">
          <span>©&nbsp;{new Date().getFullYear()} Job Hunt Alpha</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
            <a href="#features" className="py-2.5 hover:text-white">Features</a>
            <a href="#how" className="py-2.5 hover:text-white">How it works</a>
            <Link to="/login" className="py-2.5 hover:text-white">Sign in</Link>
            <Link to="/signup" className="py-2.5 hover:text-white">Create account</Link>
            <Link to="/privacy" className="py-2.5 hover:text-white">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- hero carousel

type Slide = { lead: string; accent: string; body: ReactNode };
const SLIDE_MS = 3000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Rotating hero statements. All slides share one grid cell, so the height never jumps between slides. */
function HeroCarousel({ freeModels }: { freeModels: boolean }) {
  const slides: Slide[] = [
    {
      lead: 'Build a strong resume in minutes.',
      accent: 'Then tailor it for every job.',
      body: (
        <>
          Upload the resume you have and the AI agent turns it into a strong master copy. Paste any job link to score your fit, tailor your resume
          using only your real facts, and draft the cover letter.
          {freeModels && (
            <>
              {' '}
              <mark
                className="rounded-md px-2 py-0.5 font-medium [box-decoration-break:clone]"
                style={{
                  background: 'rgba(var(--jha-sec-rgb),0.14)',
                  color: 'var(--jha-sec-pale)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--jha-sec-rgb),0.3)',
                }}
              >
                Free AI models included, no key needed.
              </mark>
            </>
          )}
        </>
      ),
    },
    {
      lead: 'Know your match score',
      accent: 'before you apply.',
      body: 'Paste a job link and see which requirements you meet, which are partial or missing, and the ATS keywords to add first.',
    },
    {
      lead: 'Rewords your experience.',
      accent: 'Never makes any up.',
      body: 'Every tailored copy uses only facts from your master resume, achievements and LinkedIn. When there’s a gap, the agent asks you.',
    },
    {
      lead: 'Cover letter and interview prep,',
      accent: 'for every role.',
      body: 'A letter written for the job, likely questions and STAR stories from your real experience, and every application tracked to the offer.',
    },
    {
      lead: 'Your next application,',
      accent: 'done properly.',
      body: 'Create an account with your name and email. Add your resume and LinkedIn now or later.',
    },
  ];

  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // user pressed pause
  const running = !paused && !reduced;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [running, index, slides.length]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="What Job Hunt Alpha does"
    >
      <div className="grid" aria-live={running ? 'off' : 'polite'}>
        {slides.map((s, i) => {
          const active = i === index;
          const Heading = i === 0 ? 'h1' : 'p';
          return (
            <div
              key={s.lead}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              aria-hidden={!active}
              className={`[grid-area:1/1] transition-[opacity,transform,filter] duration-700 ease-out ${
                active ? 'translate-y-0 opacity-100 blur-0' : 'pointer-events-none translate-y-4 opacity-0 blur-[6px]'
              }`}
            >
              <Heading
                className={`${display} mx-auto mt-4 text-[clamp(36px,4.8vw,68px)] font-semibold leading-[1.05] tracking-[-0.045em] text-white`}
              >
                <span className="min-[760px]:whitespace-nowrap">{s.lead}</span>{' '}
                <span className={`${serif} inline-block pr-[0.08em] tracking-[-0.02em]`} style={gradientText}>
                  {s.accent}
                </span>
              </Heading>
              <p className="mx-auto mt-7 max-w-[840px] text-[clamp(17px,1.5vw,19px)] leading-[1.65] text-balance text-[#a3acc2]">{s.body}</p>
            </div>
          );
        })}
      </div>

      {/* controls: progress dots + pause */}
      <div className="mt-5 flex items-center justify-center gap-1">
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <button
              key={s.lead}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}: ${s.lead} ${s.accent}`}
              aria-current={active}
              className="flex h-11 cursor-pointer items-center px-1"
            >
              <span className={`relative block h-1.5 overflow-hidden rounded-full bg-white/15 transition-[width] duration-300 ${active ? 'w-10' : 'w-1.5'}`}>
                {active && (
                  <span
                    key={`${index}-${running}`}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, var(--jha-acc-light), var(--jha-sec))',
                      width: running ? undefined : '100%',
                      animation: running ? `jhaProgress ${SLIDE_MS}ms linear forwards` : undefined,
                    }}
                  />
                )}
              </span>
            </button>
          );
        })}
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play slides' : 'Pause slides'}
            className="ml-1 flex size-11 cursor-pointer items-center justify-center rounded-full text-[#7c87a3] transition-colors hover:text-white"
          >
            {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- hero product window

type Status = 'met' | 'partial' | 'missing';
const STATUS: Record<Status, { glyph: string; label: string; fg: string; bg: string }> = {
  met: { glyph: '✓', label: 'Met', fg: '#6ee7b7', bg: 'rgba(16,185,129,0.16)' },
  partial: { glyph: '–', label: 'Partial', fg: '#fcd34d', bg: 'rgba(251,191,36,0.14)' },
  missing: { glyph: '✕', label: 'Missing', fg: '#fda4af', bg: 'rgba(251,113,133,0.14)' },
};

function ProductWindow() {
  const [tailored, setTailored] = useState(true);
  const score = tailored ? 87 : 64;
  const circumference = 2 * Math.PI * 62;
  const reqs = useMemo<{ label: string; status: Status; note: string }[]>(
    () =>
      tailored
        ? [
            { label: '5+ years building data pipelines', status: 'met', note: '7 years, two employers' },
            { label: 'Spark at scale', status: 'met', note: 'now named in role 1' },
            { label: 'Cloud cost optimisation', status: 'met', note: 'moved to the top' },
            { label: 'Airflow', status: 'missing', note: 'the agent asked you' },
          ]
        : [
            { label: '5+ years building data pipelines', status: 'met', note: '7 years, two employers' },
            { label: 'Spark at scale', status: 'partial', note: 'not named' },
            { label: 'Cloud cost optimisation', status: 'partial', note: 'buried in role 2' },
            { label: 'Airflow', status: 'missing', note: 'not listed' },
          ],
    [tailored],
  );
  const kwCovered = tailored ? 12 : 7;
  const label = `${mono} text-[11px] tracking-[0.08em] text-[#7c87a3]`;
  const hl: CSSProperties = { background: 'rgba(var(--jha-sec-rgb),0.18)', color: 'var(--jha-sec-pale)' };

  return (
    <figure className="relative mx-auto mt-9 max-w-[1080px] px-6">
      <div
        aria-hidden
        className="absolute inset-x-[10%] top-10 h-[70%] opacity-80 blur-[30px]"
        style={{ background: 'radial-gradient(closest-side, var(--jha-glow), transparent)' }}
      />

      {/* floating cards (decorative; hidden on small screens) */}
      <div
        aria-hidden
        className="jha-glass jha-float absolute -left-3 top-[150px] z-[3] hidden w-[210px] rounded-[14px] border border-white/12 bg-[rgba(15,20,40,0.72)] px-4 py-3.5 text-left shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] min-[900px]:block"
      >
        <div className={`${mono} text-[10.5px] tracking-[0.08em] text-[#7c87a3]`}>ATS KEYWORDS</div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`${display} text-[26px] font-semibold text-white`}>{kwCovered}</span>
          <span className="text-[13px] text-[#a3acc2]">of 14 covered</span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round((kwCovered / 14) * 100)}%`, background: 'linear-gradient(90deg, var(--jha-acc-light), var(--jha-sec))' }}
          />
        </div>
      </div>
      <div
        aria-hidden
        className="jha-glass jha-float absolute -right-4 top-[300px] z-[3] hidden w-[230px] rounded-[14px] border border-white/12 bg-[rgba(15,20,40,0.72)] px-4 py-3.5 text-left shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] [animation-delay:-3s] min-[900px]:block"
      >
        <div className={`${mono} flex items-center gap-2 text-[10.5px] tracking-[0.08em] text-[#7c87a3]`}>
          <span className="jha-pulse size-1.5 rounded-full bg-[#34d399]" />
          AGENT
        </div>
        <div className="mt-2 text-[13px] leading-[1.45] text-[#e2e8f0]">Cover letter and interview prep are ready for J0007.</div>
      </div>

      <div
        className="relative z-[2] rounded-[20px] p-px shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.02))' }}
      >
        <div className="overflow-hidden rounded-[19px] bg-[#0a0f1f] text-left">
          {/* window chrome */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 bg-white/[0.02] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-white/14" />
                <span className="size-2.5 rounded-full bg-white/14" />
                <span className="size-2.5 rounded-full bg-white/14" />
              </div>
              <div className="min-w-0">
                <div className={`${mono} text-[11px] tracking-[0.04em] text-[#7c87a3]`}>EXAMPLE · J0007</div>
                <div className="text-sm font-semibold text-white">
                  Senior Data Engineer <span className="font-normal text-[#7c87a3]">· Northwind Analytics · Remote</span>
                </div>
              </div>
            </div>
            <div role="group" aria-label="Which resume to score" className="inline-flex rounded-full border border-white/8 bg-white/5 p-1">
              {[
                ['Master', false],
                ['Tailored', true],
              ].map(([name, val]) => {
                const on = tailored === val;
                return (
                  <button
                    key={name as string}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTailored(val as boolean)}
                    className={`h-9 min-w-24 cursor-pointer rounded-full px-3.5 text-[13px] font-medium transition-colors ${on ? 'bg-white text-[#0b1020]' : 'text-[#a3acc2] hover:text-white'}`}
                  >
                    {name as string}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            aria-hidden
            className="jha-scan h-px bg-white/4"
            style={{ backgroundImage: 'linear-gradient(90deg, transparent, var(--jha-sec), transparent)' }}
          />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            {/* score */}
            <div className="min-w-0 border-white/6 p-6 min-[860px]:border-r">
              <div className={label}>MATCH SCORE</div>
              <div className="relative mx-auto mt-[18px] size-[148px]">
                <svg viewBox="0 0 148 148" className="size-full -rotate-90" role="img" aria-label={`Match score ${score} out of 100`}>
                  <defs>
                    <linearGradient id="jhaRing" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--jha-acc-light)" />
                      <stop offset="1" stopColor="var(--jha-sec)" />
                    </linearGradient>
                  </defs>
                  <circle cx="74" cy="74" r="62" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" />
                  <circle
                    cx="74"
                    cy="74"
                    r="62"
                    fill="none"
                    stroke="url(#jhaRing)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
                    className="transition-[stroke-dasharray] duration-[600ms]"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`${display} text-[44px] font-semibold tracking-[-0.03em] text-white tabular-nums`}>{score}</span>
                  <span className="text-xs text-[#7c87a3]">out of 100</span>
                </div>
              </div>
              <div className="mt-[18px] flex flex-wrap justify-center gap-2 text-xs">
                <span className="rounded-full bg-[rgba(251,113,133,0.12)] px-2.5 py-1 text-[#fda4af]">1 critical</span>
                <span className="rounded-full bg-[rgba(251,191,36,0.12)] px-2.5 py-1 text-[#fcd34d]">{tailored ? 0 : 2} major</span>
                <span className="rounded-full bg-white/6 px-2.5 py-1 text-[#c4cbe0]">2 minor</span>
              </div>
            </div>

            {/* requirements */}
            <div className="min-w-0 border-white/6 p-6 min-[860px]:border-r">
              <div className={label}>THE ROLE ASKS FOR</div>
              <ul className="mt-4 flex flex-col gap-3.5 text-sm leading-[1.4]">
                {reqs.map((r) => {
                  const s = STATUS[r.status];
                  return (
                    <li key={r.label} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="flex size-[22px] shrink-0 items-center justify-center rounded-md text-[13px] font-bold leading-none"
                        style={{ background: s.bg, color: s.fg }}
                      >
                        {s.glyph}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-white">{r.label}</span>
                        <br />
                        <span className="text-xs font-medium" style={{ color: s.fg }}>
                          {s.label}
                        </span>
                        <span className="text-xs text-[#7c87a3]"> · {r.note}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* resume */}
            <div className="min-w-0 bg-white/[0.015] p-6">
              <div className={label}>{tailored ? 'YOUR TAILORED RESUME' : 'YOUR MASTER RESUME'}</div>
              <div className="mt-3.5 text-sm font-semibold text-white">Data Engineer, Halcyon Freight</div>
              {tailored ? (
                <ul className="mt-2 flex list-disc flex-col gap-2 pl-[18px] font-['Instrument_Serif',Georgia,serif] text-[17px] leading-[1.4] text-[#e2e8f0]">
                  <li>
                    Led the migration of 40 batch jobs to <mark className="rounded-[3px] px-[3px]" style={hl}>Spark</mark>, cutting nightly run time
                    from 6 hours to 90 minutes.
                  </li>
                  <li>
                    Reduced warehouse spend 40% through <mark className="rounded-[3px] px-[3px]" style={hl}>cost optimisation</mark> of storage tiers.
                  </li>
                </ul>
              ) : (
                <ul className="mt-2 flex list-disc flex-col gap-2 pl-[18px] font-['Instrument_Serif',Georgia,serif] text-[17px] leading-[1.4] text-[#a3acc2]">
                  <li>Worked on moving 40 batch jobs to a new framework. Run time went from 6 hours to 90 minutes.</li>
                  <li>Helped reduce warehouse spend by 40%.</li>
                </ul>
              )}
              <div className="mt-[18px] flex flex-wrap gap-1.5">
                {['Cover letter', 'Interview prep', 'Export PDF'].map((t) => (
                  <span key={t} className="rounded-lg border border-white/10 px-2.5 py-[5px] text-xs text-[#c4cbe0]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-[18px] text-center text-[13px] text-[#7c87a3]">
        Try it: switch between your master resume and the tailored copy. (Example role and scores.)
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- features (bento)

function Tile({ className = '', style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`jha-tile jha-glass min-w-0 rounded-[20px] border border-white/8 p-7 ${className}`} style={style}>
      {children}
    </div>
  );
}
const tileTitle = `${display} m-0 text-xl font-semibold tracking-[-0.02em] text-white`;
const tileText = 'mt-2 text-sm leading-[1.55] text-[#a3acc2]';

function Features() {
  const found: CSSProperties = { background: 'rgba(var(--jha-sec-rgb),0.14)', color: 'var(--jha-sec-pale)' };
  return (
    <section id="features" className="relative">
      <div className="mx-auto max-w-[1200px] px-6 pt-[136px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className={eyebrow}>WHAT YOU GET</p>
            <h2 className={`${h2} max-w-[16ch]`}>
              One workspace for <span className={serif}>every</span> application.
            </h2>
          </div>
          <p className="max-w-[40ch] text-[17px] leading-relaxed text-[#a3acc2]">
            From the first read of the posting to the offer stage, everything for a role lives on one page.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 min-[900px]:grid-cols-6">
          <Tile className="flex flex-col gap-6 min-[900px]:col-span-4">
            <div>
              <h3 className={`${tileTitle} text-[22px]`}>Gap analysis that tells you what to do</h3>
              <p className={`${tileText} max-w-[52ch] text-[15px] leading-relaxed`}>
                Critical, major and minor gaps, each requirement marked met, partial or missing with the evidence, and questions the agent wants
                you to answer.
              </p>
            </div>
            <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-2.5">
              <GapCard tone="critical" title="No Airflow listed" />
              <GapCard tone="major" title="Cost work buried in role 2" />
              <GapCard tone="minor" title="Summary too long" />
            </div>
          </Tile>

          <Tile className="flex flex-col justify-between gap-5 min-[900px]:col-span-2" style={{ backgroundColor: 'rgba(var(--jha-acc-rgb),0.06)' }}>
            <div className={`${mono} text-[11px] tracking-[0.1em] text-[#a3acc2]`}>RE-SCORED AUTOMATICALLY</div>
            <div className="flex items-baseline gap-3">
              <span className={`${display} text-[40px] font-semibold text-[#5d6884] line-through decoration-2`}>64</span>
              <span
                className={`${display} text-[80px] leading-[0.9] font-semibold tracking-[-0.04em]`}
                style={{ background: 'linear-gradient(180deg, #ffffff, var(--jha-acc-light))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
              >
                87
              </span>
            </div>
            <p className="text-sm leading-[1.55] text-[#a3acc2]">
              Every tailored copy is scored against the role again, so you see exactly what changed. (Example scores.)
            </p>
          </Tile>

          <Tile className="min-[900px]:col-span-2">
            <h3 className={tileTitle}>ATS keyword coverage</h3>
            <p className={tileText}>Found and missing keywords, highlighted right in your resume.</p>
            <div className="mt-5 flex flex-wrap gap-1.5 text-[12.5px]">
              {['Spark', 'Python', 'dbt', 'SQL'].map((k) => (
                <span key={k} className="rounded-full px-2.5 py-[5px]" style={found}>
                  ✓ {k}
                </span>
              ))}
              {['Airflow', 'Kafka'].map((k) => (
                <span key={k} className="rounded-full border border-dashed border-[rgba(251,113,133,0.5)] px-[9px] py-1 text-[#fda4af]">
                  ✕ {k}
                </span>
              ))}
            </div>
          </Tile>

          <Tile className="min-[900px]:col-span-4">
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
              <h3 className={tileTitle}>Your pipeline, at a glance</h3>
              <p className="text-sm text-[#a3acc2]">Move each role along as you hear back.</p>
            </div>
            <div aria-hidden className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
              {[
                ['Saved', ['Platform Eng.']],
                ['Applied', ['Data Eng. II', 'ML Ops']],
                ['Screening', ['Analytics Lead']],
                ['Interviewing', ['Sr. Data Eng.']],
                ['Offer', []],
              ].map(([col, cards]) => {
                const active = col === 'Interviewing';
                return (
                  <div
                    key={col as string}
                    className="rounded-xl border p-2.5"
                    style={
                      active
                        ? { background: 'rgba(var(--jha-acc-rgb),0.1)', borderColor: 'rgba(var(--jha-pale-rgb),0.3)' }
                        : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }
                    }
                  >
                    <div className="text-[11.5px] font-medium" style={{ color: active ? 'var(--jha-pale)' : '#a3acc2' }}>
                      {col as string}
                    </div>
                    {(cards as string[]).map((c) => (
                      <div key={c} className={`mt-1.5 rounded-lg p-2 text-xs first-of-type:mt-2 ${active ? 'bg-white/8 text-white' : 'bg-white/5 text-[#e2e8f0]'}`}>
                        {c}
                      </div>
                    ))}
                    {(cards as string[]).length === 0 && (
                      <div className="mt-2 rounded-lg border border-dashed border-white/14 p-2 text-xs text-[#7c87a3]">Next one</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Tile>

          <Tile className="min-[900px]:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className={tileTitle}>Copilot</h3>
              <kbd className={`${mono} rounded-md border border-white/12 px-2 py-0.5 text-[11px] text-[#a3acc2]`}>⌘J</kbd>
            </div>
            <p className={tileText}>A chat agent that knows which page you’re on, and can create jobs, run workflows and edit resumes.</p>
            <div className="mt-5 flex flex-col gap-2 text-[13.5px] leading-[1.45]">
              <div className="max-w-[85%] self-end rounded-[14px_14px_4px_14px] px-3.5 py-2.5 text-white" style={{ background: 'linear-gradient(180deg, var(--jha-acc-light), var(--jha-acc))' }}>
                Which of these should I apply to first?
              </div>
              <div className="max-w-[90%] self-start rounded-[14px_14px_14px_4px] border border-white/8 bg-white/6 px-3.5 py-2.5 text-[#e2e8f0]">
                Start with J0007. It’s your strongest match, and the one gap is something you can answer in a sentence.
              </div>
            </div>
          </Tile>

          <Tile className="min-[900px]:col-span-3">
            <h3 className={tileTitle}>Cover letters and interview prep</h3>
            <p className={tileText}>A letter for the role, plus likely questions and STAR stories from your real experience.</p>
            <div className="mt-5 rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[13.5px] font-medium text-white">“Tell me about a time you cut costs.”</div>
              <div className={`${mono} mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]`}>
                {['Situation', 'Task', 'Action'].map((t) => (
                  <span key={t} className="rounded-md py-1.5" style={{ background: 'rgba(var(--jha-acc-rgb),0.18)', color: 'var(--jha-pale)' }}>
                    {t}
                  </span>
                ))}
                <span className="rounded-md py-1.5" style={{ background: 'rgba(var(--jha-sec-rgb),0.16)', color: 'var(--jha-sec-pale)' }}>
                  Result
                </span>
              </div>
            </div>
          </Tile>

          <Tile className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5 min-[900px]:col-span-6">
            <div className="min-w-0 flex-[1_1_300px]">
              <h3 className={tileTitle}>A resume library that names itself</h3>
              <p className={tileText}>Your master and every tailored copy, named by job and company, so you always send the right one.</p>
            </div>
            <div className={`${mono} flex min-w-0 flex-[2_1_420px] flex-col gap-1.5 text-[12.5px]`}>
              {[
                ['master_resume.md', 'MASTER'],
                ['Jane_Doe_Resume_J0007_Northwind_Analytics.md', '87'],
                ['Jane_Doe_Resume_J0006_Halcyon_Freight.md', '79'],
              ].map(([file, tag]) => (
                <div key={file} className="flex justify-between gap-3 overflow-hidden rounded-[10px] bg-white/4 px-3.5 py-2.5 text-[#e2e8f0]">
                  <span className="truncate">{file}</span>
                  <span className="shrink-0" style={{ color: tag === 'MASTER' ? 'var(--jha-sec-light)' : '#a3acc2' }}>
                    {tag}
                  </span>
                </div>
              ))}
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

function GapCard({ tone, title }: { tone: 'critical' | 'major' | 'minor'; title: string }) {
  const t = {
    critical: { bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.2)', label: '#fda4af', text: '#ffe4e6' },
    major: { bg: 'rgba(251,191,36,0.07)', border: 'rgba(251,191,36,0.2)', label: '#fcd34d', text: '#fef3c7' },
    minor: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', label: '#a3acc2', text: '#e2e8f0' },
  }[tone];
  return (
    <div className="rounded-xl border p-3.5" style={{ background: t.bg, borderColor: t.border }}>
      <div className={`${mono} text-[10.5px] tracking-[0.08em] uppercase`} style={{ color: t.label }}>
        {tone}
      </div>
      <div className="mt-1.5 text-sm" style={{ color: t.text }}>
        {title}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- how it works

function HowItWorks() {
  const steps: { title: ReactNode; body: string }[] = [
    {
      title: 'Add your master resume',
      body: 'Upload a PDF or Word file, then add your LinkedIn profile and achievements. It’s the one source every tailored copy is built from, and it’s never changed.',
    },
    {
      title: (
        <>
          Paste a job link{' '}
          <kbd className={`${mono} rounded-md border border-white/12 px-[7px] py-[3px] align-middle text-xs font-normal text-[#a3acc2]`}>⌘K</kbd>
        </>
      ),
      body: 'The agent pulls out the must-haves, nice-to-haves, ATS keywords and red flags, then scores your resume against them.',
    },
    {
      title: 'Tailor, apply, track',
      body: 'Get a tailored resume, a cover letter and interview prep, then move the application along as you hear back.',
    },
  ];
  return (
    <section id="how" className="relative">
      <div className="mx-auto max-w-[1200px] px-6 pt-[136px]">
        <p className={eyebrow}>HOW IT WORKS</p>
        <h2 className={`${h2} max-w-[18ch]`}>
          From job link to <span className={serif}>ready to send.</span>
        </h2>
        <ol className="mt-16 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            return (
              <li
                key={i}
                className="min-w-0 rounded-[20px] border px-7 py-8"
                style={
                  last
                    ? { borderColor: 'rgba(var(--jha-pale-rgb),0.25)', background: 'linear-gradient(180deg, rgba(var(--jha-acc-rgb),0.12), transparent)' }
                    : { borderColor: 'rgba(255,255,255,0.08)', background: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent)' }
                }
              >
                <div
                  className="font-['Instrument_Serif',Georgia,serif] text-[72px] leading-[0.8] text-transparent"
                  style={{ WebkitTextStroke: last ? '1px var(--jha-sec-light)' : '1px rgba(var(--jha-pale-rgb),0.55)' }}
                  aria-hidden
                >
                  {i + 1}
                </div>
                <h3 className={`${display} mt-7 text-[21px] font-semibold tracking-[-0.02em] text-white`}>
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-[1.65] text-[#a3acc2]">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- honesty rule (light band)

function HonestyRule() {
  const del = 'rounded-[3px] bg-[#ffe4e6] px-[3px] text-[#9f1239] line-through decoration-[#e11d48]';
  const ins = 'rounded-[3px] bg-[#dcfce7] px-[3px] text-[#14532d]';
  return (
    <section id="truthful" className="relative mt-[136px] bg-[#f4f5fa] text-slate-800">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-16 px-6 py-[120px]">
        <div className="min-w-0">
          <p className={`${mono} text-xs tracking-[0.12em]`} style={{ color: 'var(--jha-acc)', filter: 'brightness(0.75)' }}>
            THE HONESTY RULE
          </p>
          <h2 className={`${display} mt-4 max-w-[15ch] text-[clamp(32px,4.4vw,56px)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#0b1020]`}>
            It rewords your experience. <span className={serif}>It never makes any up.</span>
          </h2>
          <p className="mt-6 max-w-[50ch] text-[17px] leading-[1.65] text-slate-600">
            The agent can only use facts from your master resume, your achievements and your LinkedIn. It reorders, rephrases and brings the right
            keywords forward. It never adds employers, titles, dates or numbers you didn’t give it.
          </p>
          <div className="mt-8 grid max-w-[520px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {[
              ['Rephrases', 'and reorders what’s there'],
              ['Asks first', 'when it finds a gap'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-[14px] border border-slate-200 bg-white p-4">
                <div className={`${display} text-base font-semibold text-[#0b1020]`}>{t}</div>
                <div className="mt-1 text-[13px] text-slate-500">{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_30px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className={`${mono} flex items-center justify-between border-b border-[#eef0f5] px-5 py-3.5 text-[11.5px] text-slate-500`}>
              <span>CHANGES FROM MASTER</span>
              <span>EXAMPLE</span>
            </div>
            <p className="m-0 p-6 font-['Instrument_Serif',Georgia,serif] text-[21px] leading-[1.55] text-[#0b1020]">
              <del className={del}>Worked on moving</del> <ins className={`${ins} no-underline`}>Led the migration of</ins> 40 batch jobs to{' '}
              <del className={del}>a new framework</del> <ins className={`${ins} no-underline`}>Spark</ins>, cutting nightly run time from 6 hours to 90
              minutes.
            </p>
            <div className="flex flex-wrap gap-2 px-6 pb-6 text-[12.5px]">
              {['Same employer', 'Same numbers', 'Same dates'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-[5px] text-slate-700">
                  <Check className="size-3.5" aria-hidden /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-[-18px] mr-6 ml-auto flex max-w-[340px] items-start gap-3 rounded-2xl bg-[#0b1020] px-[18px] py-4 text-[#e2e8f0] shadow-[0_20px_40px_-16px_rgba(15,23,42,0.6)]">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, var(--jha-acc), var(--jha-sec))' }}
            >
              ?
            </span>
            <p className="text-sm leading-normal">
              <span className="font-semibold text-white">The agent asks:</span> The role wants Airflow. Have you used it? If so, where?
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- AI sources + privacy

function AiSources({ freeModels }: { freeModels: boolean }) {
  const sources = [
    { mono: 'G', name: 'Google Gemini', detail: 'Your key · free tier', status: 'Active', fg: '#6ee7b7', bg: 'rgba(16,185,129,0.14)' },
    ...(freeModels ? [{ mono: 'OR', name: 'OpenRouter', detail: 'Included free models', status: 'Ready', fg: '#93c5fd', bg: 'rgba(59,130,246,0.14)' }] : []),
    { mono: 'LM', name: 'LM Studio', detail: 'On your computer', status: 'Ready', fg: '#93c5fd', bg: 'rgba(59,130,246,0.14)' },
    { mono: 'HF', name: 'Hugging Face', detail: 'Rate limited · back in 2 min', status: 'Paused', fg: '#fcd34d', bg: 'rgba(251,191,36,0.12)' },
  ];
  const points = [
    'If one source hits a rate limit, the run moves to the next',
    'Spread runs evenly, or set a priority order',
    'Keys are forgotten when you close the tab unless you save them',
  ];
  return (
    <section id="ai" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[200px] top-20 size-[700px] opacity-35"
        style={{ background: 'radial-gradient(closest-side, var(--jha-glow), transparent)' }}
      />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-16 px-6 pt-[136px]">
        <div className="min-w-0">
          <p className={eyebrow}>AI MODELS</p>
          <h2 className={`${h2} max-w-[14ch]`}>
            {freeModels ? (
              <>
                Free AI included. <span className={serif}>Or bring your own.</span>
              </>
            ) : (
              <>
                Bring your own AI. <span className={serif}>Free tiers work.</span>
              </>
            )}
          </h2>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-[1.65] text-[#a3acc2]">
            {freeModels && 'Start on the free models that come with the app. Or connect '}
            {!freeModels && 'Connect '}
            your own key from Google AI Studio, OpenAI or OpenRouter, or a model running on your computer with LM Studio.
          </p>
          <ul className="mt-7 flex flex-col gap-3.5 text-[15px] text-[#e2e8f0]">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <Check className="mt-px size-5 shrink-0" style={{ color: 'var(--jha-sec)' }} aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="jha-glass min-w-0 rounded-[20px] border border-white/10 p-2 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-3">
            <span className={`${display} text-base font-semibold text-white`}>AI sources</span>
            <span className="inline-flex rounded-full bg-white/6 p-[3px] text-xs" aria-hidden>
              <span className="rounded-full bg-white/12 px-3 py-[5px] text-white">Balanced</span>
              <span className="px-3 py-[5px] text-[#a3acc2]">Priority order</span>
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {sources.map((s) => (
              <li key={s.name} className="flex items-center gap-3.5 rounded-xl bg-white/[0.03] px-4 py-3.5">
                <span aria-hidden className={`${display} flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-white/6 text-[13px] font-semibold text-[#e2e8f0]`}>
                  {s.mono}
                </span>
                <div className="min-w-0 flex-auto">
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <div className="text-[12.5px] text-[#7c87a3]">{s.detail}</div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: s.bg, color: s.fg }}>
                  <span className="size-1.5 rounded-full" style={{ background: s.fg }} />
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-3 pb-2.5 text-xs text-[#7c87a3]">Example settings.</p>
        </div>
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 pt-24">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-px overflow-hidden rounded-[20px] border border-white/8 bg-white/8">
          {[
            { icon: ShieldCheck, title: 'Your search stays yours', body: 'Resumes, applications and settings belong to your account alone.' },
            { icon: Mail, title: 'No password to leak', body: 'Sign in with a one-time link sent to your email.' },
            { icon: Lock, title: 'An agent with limits', body: 'It can’t run commands or write files directly, and your master is never overwritten.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-[#070a16] p-7">
              <Icon className="size-[22px]" style={{ color: 'var(--jha-acc-light)' }} strokeWidth={1.8} aria-hidden />
              <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-[1.55] text-[#a3acc2]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- final call to action

function FinalCta() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1200px] px-6 pt-[136px] pb-[120px]">
        <div
          className="relative overflow-hidden rounded-[28px] border px-6 py-[clamp(48px,8vw,96px)] text-center"
          style={{
            borderColor: 'rgba(var(--jha-pale-rgb),0.25)',
            background: 'radial-gradient(120% 140% at 50% 0%, rgba(var(--jha-acc-rgb),0.35), rgba(5,7,15,0) 60%), #080c1c',
          }}
        >
          <div aria-hidden className="jha-grid pointer-events-none absolute inset-0" />
          <h2 className={`${display} relative mx-auto max-w-[15ch] text-[clamp(36px,5.6vw,72px)] leading-none font-semibold tracking-[-0.045em] text-white`}>
            Your next application, <span className={serif}>done properly.</span>
          </h2>
          <p className="relative mx-auto mt-6 max-w-[46ch] text-lg leading-relaxed text-[#a3acc2]">
            Create an account with your name and email. Add your resume and LinkedIn now or later.
          </p>
          <div className="relative mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="jha-btn inline-flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-base font-semibold text-[#0b1020]">
              Create your account <ArrowRight className="size-[18px]" aria-hidden />
            </Link>
            <Link
              to="/login"
              className="inline-flex h-14 items-center rounded-full border border-white/18 px-6 text-base font-medium text-[#e2e8f0] transition hover:border-white/28 hover:bg-white/6"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
