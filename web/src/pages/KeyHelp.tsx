import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ExternalLink, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Card, SectionTitle } from '../components/ui';

/** "API key help": how to get a key for each bring-your-own-key service, and how the app handles it. */
export function KeyHelpPage() {
  const { hash } = useLocation();

  // the router doesn't scroll to #anchors on its own
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-8">
      <PageHeader title="Getting an API key" sub="Bring your own key from Google AI Studio, OpenAI, OpenRouter or NaraRouter. Each takes a few minutes to set up." />

      <nav aria-label="On this page" className="mb-6 flex flex-wrap gap-2 text-sm">
        {[
          ['google', 'Google AI Studio'],
          ['openai', 'OpenAI'],
          ['openrouter', 'OpenRouter'],
          ['nararouter', 'NaraRouter'],
          ['privacy', 'How your key is handled'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            {label}
          </a>
        ))}
      </nav>

      <Callout tone="info" title="Don’t have a key? You don’t need one to start">
        When the app comes with free models included, they’re used automatically until you add a key of your own. They run through OpenRouter or NaraRouter, are shared
        by everyone using the app, and are rate-limited, so they can be slow or briefly unavailable. Your own key, even a free Google AI Studio one, is
        faster and more reliable.
      </Callout>
      <div className="mb-5" />

      {/* ------------------------------------------------------------ Google */}
      <Section id="google" title="Google AI Studio (Gemini)" badge="Free tier">
        <p>
          Google AI Studio gives you a key for the Gemini API. It has a free tier that needs no credit card, which makes it the easiest way to get started.
          All you need is a Google account.
        </p>

        <Steps>
          <Step n={1} title="Open the API key page">
            Go to <ExtLink href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</ExtLink> and sign in with your Google account. On your first
            visit, Google asks you to accept the Gemini API terms.
          </Step>
          <Step n={2} title="Create a key">
            Click <b>Create API key</b>. If you’re asked for a Google Cloud project, pick an existing one or let AI Studio create a new one for you. You don’t
            need to set anything up in Google Cloud yourself.
          </Step>
          <Step n={3} title="Copy the key">
            The new key appears in the list. It starts with <Code>AIza</Code>. Click it and copy the full key. You can come back to this page any time to copy it
            again.
          </Step>
          <Step n={4} title="Add it here">
            Go to <Link to="/settings" className="font-medium text-brand-700 hover:underline">AI sources</Link>, click <b>Google AI Studio (Gemini)</b> under
            “Bring your own key”, and paste the key.
          </Step>
          <Step n={5} title="Pick a model">
            Click <b>Load models</b> and choose one. Flash models are fast and have the most generous free limits, so they’re a good default.
          </Step>
          <Step n={6} title="Decide whether to save the key, then test">
            Leave <b>Save this key on this computer?</b> off if you’d rather enter it each session. Click <b>Add source</b>, then <b>Test</b> to check that it
            works.
          </Step>
        </Steps>

        <Callout tone="warn" title="Before you use the free tier">
          On the free tier, Google may use your prompts and responses to improve its products. Here that includes your resume and the job postings you
          scan. If you don’t want that, turn on billing for the key’s project in AI Studio. Paid usage isn’t used this way, and costs a few cents per run with
          Flash models.
        </Callout>

        <Trouble
          items={[
            ['“API key not valid”', 'The key was copied incompletely, or it was deleted. Copy it again from AI Studio.'],
            ['“Resource exhausted” or HTTP 429', 'You’ve hit the free tier’s per-minute or daily limit. The app pauses this source and tries another; it recovers on its own. A Flash model or billing raises the limit.'],
            ['“User location is not supported”', 'The Gemini API isn’t available in your country. Use OpenAI or OpenRouter instead.'],
            ['Model loads but the test says it “did not call the tool”', 'Pick a different, newer Gemini model. The app needs one that supports tool calling.'],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------ OpenAI */}
      <Section id="openai" title="OpenAI" badge="Paid">
        <p>OpenAI keys are billed per use, so you need to add credit to your account first. A full tailoring run on a small model usually costs a few cents.</p>
        <Steps>
          <Step n={1} title="Sign in">
            Go to <ExtLink href="https://platform.openai.com">platform.openai.com</ExtLink> and sign in, or create an account.
          </Step>
          <Step n={2} title="Add credit">
            Under <b>Settings → Billing</b>, add a payment method and buy some credit. Keys don’t work until the account has a balance.
          </Step>
          <Step n={3} title="Create the key">
            Open <ExtLink href="https://platform.openai.com/api-keys">API keys</ExtLink> and click <b>Create new secret key</b>. Copy it straight away: it
            starts with <Code>sk-</Code> and is shown only once.
          </Step>
          <Step n={4} title="Add it here">
            In <Link to="/settings" className="font-medium text-brand-700 hover:underline">AI sources</Link>, click <b>OpenAI</b>, paste the key, click{' '}
            <b>Load models</b>, and pick one. Then <b>Add source</b> and <b>Test</b>.
          </Step>
        </Steps>
        <Callout tone="info" title="Keep costs in check">
          Set a monthly budget under Billing → Limits on the OpenAI site. You can also set a <b>Daily run limit</b> on the source here.
        </Callout>
      </Section>

      {/* ------------------------------------------------------------ OpenRouter */}
      <Section id="openrouter" title="OpenRouter" badge="Free models available">
        <p>OpenRouter is one key for hundreds of models from many companies. Models whose name ends in <Code>:free</Code> cost nothing but have tight rate limits.</p>
        <Steps>
          <Step n={1} title="Sign in">
            Go to <ExtLink href="https://openrouter.ai">openrouter.ai</ExtLink> and sign in.
          </Step>
          <Step n={2} title="Create the key">
            Open <ExtLink href="https://openrouter.ai/settings/keys">Settings → Keys</ExtLink>, click <b>Create key</b>, and copy it. It starts with{' '}
            <Code>sk-or-</Code>.
          </Step>
          <Step n={3} title="Add it here">
            In <Link to="/settings" className="font-medium text-brand-700 hover:underline">AI sources</Link>, click <b>OpenRouter</b>, paste the key, and use{' '}
            <b>Load models</b> to pick a free model that supports tools.
          </Step>
        </Steps>
      </Section>

      {/* ------------------------------------------------------------ NaraRouter */}
      <Section id="nararouter" title="NaraRouter" badge="Free models available">
        <p>
          NaraRouter is another router with free models. Its <b>combos</b> bundle up to five models that are tried in turn, so when one free model is busy
          the next one answers instead.
        </p>
        <Steps>
          <Step n={1} title="Sign in">
            Go to <ExtLink href="https://router.bynara.id">router.bynara.id</ExtLink> and sign in or create an account.
          </Step>
          <Step n={2} title="Create the key">
            Create an API key in the dashboard and copy it straight away; it’s shown only once. It starts with <Code>sk-nry-</Code>.
          </Step>
          <Step n={3} title="Make a combo (recommended)">
            Under <b>Developer → Model combos</b>, add a few free models that support tools, in the order to try them. Its model id is{' '}
            <Code>combo/&lt;name&gt;</Code>, for example <Code>combo/free-pack</Code>.
          </Step>
          <Step n={4} title="Add it here">
            In <Link to="/settings" className="font-medium text-brand-700 hover:underline">AI sources</Link>, add <b>NaraRouter</b>, paste the key, and type
            your combo as the model, or use <b>Load models</b> to pick a single model.
          </Step>
        </Steps>
      </Section>

      {/* ------------------------------------------------------------ privacy */}
      <Section id="privacy" title="How this app handles your key" icon={<ShieldCheck className="size-4 text-emerald-600" />}>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Not saved unless you say so.</b> By default your key is held in the app’s memory only. It’s forgotten a few seconds after you close the browser
            tab, or when the app restarts. Next time you’ll be asked for it again.
          </li>
          <li>
            <b>Saving is your choice.</b> Tick <b>Save this key on this computer?</b> when adding a source, or click <b>Save it</b> next to a session key. Saved
            keys go in <Code>data/settings.json</Code>, readable only by your user account. Click <b>Forget key</b> to remove one at any time.
          </li>
          <li>
            <b>Never shown back.</b> After you enter a key, the page shows only its last four characters. The key is sent only to the service it belongs to.
          </li>
          <li>
            <b>Included free models</b> use the app’s own OpenRouter key, which is never shown to you. Some free model providers may log prompts, and
            here those include your resume. Use your own key if that matters to you.
          </li>
          <li>
            <b>Closing the tab during a run</b> stops a session-only key from working, so any run still in progress on that source fails over to another
            source, or stops if there is none.
          </li>
        </ul>
      </Section>

      <div className="mt-8 flex justify-end">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          Go to AI sources <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- building blocks

function Section({ id, title, badge, icon, children }: { id: string; title: string; badge?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="mb-5 scroll-mt-6 p-5 sm:p-6">
      <SectionTitle right={badge && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-100">{badge}</span>}>
        <span className="inline-flex items-center gap-1.5">
          {icon ?? <KeyRound className="size-4 text-brand-600" />} {title}
        </span>
      </SectionTitle>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-slate-700">{children}</div>
    </Card>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3">{children}</ol>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold tabular-nums text-white">
        {n}
      </span>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  );
}

function Callout({ tone, title, children }: { tone: 'warn' | 'info'; title: string; children: ReactNode }) {
  const cls = tone === 'warn' ? 'bg-amber-50 ring-amber-200 text-amber-950' : 'bg-sky-50 ring-sky-200 text-sky-950';
  return (
    <div className={`rounded-lg p-3 ring-1 ring-inset ${cls}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        {tone === 'warn' && <TriangleAlert className="size-4" />} {title}
      </div>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function Trouble({ items }: { items: [string, string][] }) {
  return (
    <div>
      <div className="font-semibold text-slate-900">If something goes wrong</div>
      <dl className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-inset ring-slate-200">
        {items.map(([q, a]) => (
          <div key={q} className="px-3 py-2">
            <dt className="font-medium text-slate-800">{q}</dt>
            <dd className="mt-0.5 text-slate-600">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12.5px] text-slate-800">{children}</code>;
}
