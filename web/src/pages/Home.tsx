import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  FileCheck2,
  FileText,
  KanbanSquare,
  KeyRound,
  Link2,
  MailCheck,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { auth } from '../lib/auth';

/** Public home page for signed-out visitors: what the app does, plus sign-in and sign-up. */
export function HomePage() {
  const [freeModels, setFreeModels] = useState(false);
  useEffect(() => {
    auth.config().then((c) => setFreeModels(c.freeModels)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800 [font-feature-settings:'kern'_1]">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="hidden text-[15px] font-semibold tracking-tight text-slate-900 min-[420px]:inline">Job Hunt Alpha</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Sign in
            </Link>
            <Link to="/signup" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.14),transparent)]" />
          <div className="relative mx-auto grid max-w-[1120px] items-center gap-12 px-4 pb-16 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
                <Sparkles className="size-3.5" /> Your AI career agent
              </span>
              <h1 className="mt-5 max-w-[16ch] text-[clamp(34px,5vw,52px)] font-semibold leading-[1.08] tracking-tight text-slate-900">
                Apply to the right jobs with the right resume.
              </h1>
              <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-slate-600">
                Paste a job link. The agent reads the posting, tells you how well you match, and tailors your resume to it without inventing
                anything. Then it drafts your cover letter, preps you for the interview, and keeps every application on one board.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-b from-brand-500 to-brand-700 px-5 text-[15px] font-medium text-white shadow-sm ring-1 ring-inset ring-white/10 hover:from-brand-600"
                >
                  Get started free <ArrowRight className="size-4" />
                </Link>
                <Link to="/login" className="inline-flex h-11 items-center rounded-lg px-4 text-[15px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                  I have an account
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500">
                <MailCheck className="size-4" /> No password. Sign in with a link we email you.
              </p>
            </div>

            <ExampleCard />
          </div>
        </section>

        {/* ------------------------------------------------------------ how it works */}
        <section className="border-y border-slate-200/70 bg-slate-50/70">
          <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6">
            <SectionHead eyebrow="How it works" title="From job link to ready-to-send in three steps" />
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              <Step n={1} icon={<Upload className="size-5" />} title="Add your master resume">
                Upload a PDF or Word file, and add your LinkedIn profile and achievements. This is the single source of truth every tailored
                version is built from.
              </Step>
              <Step n={2} icon={<Link2 className="size-5" />} title="Paste a job link">
                The agent reads the posting and pulls out the title, company, salary, requirements and keywords. It warns you if you’re already
                tracking the same role.
              </Step>
              <Step n={3} icon={<FileCheck2 className="size-5" />} title="Tailor, apply, track">
                Get a match score, a tailored resume, a cover letter and interview prep. Move the application along as you hear back.
              </Step>
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ features */}
        <section className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6">
          <SectionHead eyebrow="What you get" title="Everything one application needs, in one place" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<Target className="size-5" />} title="Match analysis">
              A score out of 100, the strengths to lead with, the gaps to address, and watch-outs hidden in the posting.
            </Feature>
            <Feature icon={<FileText className="size-5" />} title="Truthful tailored resumes">
              Reworded and reordered for each role, with keyword coverage for applicant-tracking systems. It never invents employers, titles,
              dates or metrics. Edit, download or print to PDF.
            </Feature>
            <Feature icon={<MessageSquareText className="size-5" />} title="Cover letters and interview prep">
              A cover letter in your voice, plus likely questions and STAR stories drawn from your real experience.
            </Feature>
            <Feature icon={<KanbanSquare className="size-5" />} title="Application pipeline">
              Saved, Applied, Screening, Interviewing, Offer. See where every role stands, your response rate, and what to do next.
            </Feature>
            <Feature icon={<Bot className="size-5" />} title="Copilot">
              Ask about any job or your search as a whole: “Which of these should I apply to first?” or “Shorten my summary for this role.”
            </Feature>
            <Feature icon={<Copy className="size-5" />} title="Resume library">
              Your master resume and every tailored copy, named by job and company so you always send the right one.
            </Feature>
          </div>
        </section>

        {/* ------------------------------------------------------------ AI + privacy */}
        <section className="mx-auto grid max-w-[1120px] gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2">
          <Panel icon={<KeyRound className="size-5" />} title={freeModels ? 'Free AI included, or bring your own' : 'Bring your own AI'}>
            {freeModels ? 'Start right away on the free models included with the app. ' : ''}
            Connect your own key from Google AI Studio (free tier), OpenAI or OpenRouter, or a model running on your own computer with LM Studio.
            Keys are forgotten when you close the tab unless you choose to save them.
            <Link to="/signup" className="mt-3 flex w-fit items-center gap-1 font-medium text-brand-700 hover:underline">
              Set it up after you sign up <ArrowRight className="size-3.5" />
            </Link>
          </Panel>
          <Panel icon={<ShieldCheck className="size-5" />} title="Your search stays yours">
            Your resumes, applications and settings belong to your account and nobody else’s. You sign in with a one-time code sent to your email,
            so there’s no password to leak or forget.
          </Panel>
        </section>

        {/* ------------------------------------------------------------ final call to action */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-[1120px] overflow-hidden rounded-2xl bg-slate-900 px-6 py-12 text-center sm:px-12">
            <h2 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-tight text-white">Ready for your next application?</h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed text-slate-300">
              Create an account with your name and email. Add your resume and LinkedIn now or later.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/signup" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[15px] font-medium text-slate-900 hover:bg-slate-100">
                Create your account <ArrowRight className="size-4" />
              </Link>
              <Link to="/login" className="inline-flex h-11 items-center rounded-lg px-4 text-[15px] font-medium text-slate-200 ring-1 ring-inset ring-white/20 hover:bg-white/5">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6">
          <span>©&nbsp;{new Date().getFullYear()} Job Hunt Alpha</span>
          <span className="flex gap-4">
            <Link to="/login" className="hover:text-slate-800">
              Sign in
            </Link>
            <Link to="/signup" className="hover:text-slate-800">
              Create account
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Logo() {
  return (
    <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/30">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
        <path d="M7 22l5-11 4 7 2.5-3.5L25 22" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Illustration of a scored job, clearly labelled as an example. */
function ExampleCard() {
  const score = 82;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <figure className="relative mx-auto w-full max-w-[440px]">
      <div aria-hidden className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-100/70 to-sky-100/50 blur-2xl" />
      <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Example</div>
            <div className="mt-1 text-[15px] font-semibold text-slate-900">Senior Data Engineer</div>
            <div className="text-sm text-slate-500">Northwind Analytics · Remote</div>
          </div>
          <div className="relative size-[76px] shrink-0">
            <svg viewBox="0 0 76 76" className="size-full -rotate-90">
              <circle cx="38" cy="38" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
              <circle cx="38" cy="38" r={r} fill="none" stroke="#059669" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold tabular-nums text-slate-900">{score}</span>
              <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-slate-400">match</span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {['Lead with your Spark pipeline migration', 'Highlight the 40% cost reduction you delivered', 'Address: no Airflow listed yet'].map((t, i) => (
            <div key={t} className="flex items-start gap-2">
              <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${i < 2 ? 'text-emerald-600' : 'text-amber-500'}`} />
              <span className="text-slate-700">{t}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {['Tailored resume', 'Cover letter', 'Interview prep'].map((t) => (
            <span key={t} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-1 border-t border-slate-100 pt-4 text-xs">
          {['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer'].map((s, i) => (
            <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className={`h-1.5 w-full rounded-full ${i <= 1 ? 'bg-brand-500' : 'bg-slate-200'}`} />
              <span className={`max-w-full truncate text-[10.5px] sm:text-xs ${i === 1 ? 'font-medium text-brand-700' : 'text-slate-400'}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">Example of a job scored at 82 out of 100, with suggestions and the application stage.</figcaption>
    </figure>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-[60ch]">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{eyebrow}</div>
      <h2 className="mt-2 text-[clamp(24px,3vw,30px)] font-semibold leading-tight tracking-tight text-slate-900">{title}</h2>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-slate-200/80 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-400">Step {n}</span>
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</p>
    </li>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/80 p-5 transition hover:border-slate-300 hover:shadow-sm">
      <span className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white">{icon}</span>
      <h3 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/80">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-slate-200">{icon}</span>
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}
