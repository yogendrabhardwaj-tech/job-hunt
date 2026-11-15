import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, Link2, Upload, X } from 'lucide-react';
import { auth, type SignupProfile } from '../lib/auth';
import { api } from '../lib/api';
import { AuthShell, CodeStep, FormError } from '../components/AuthShell';
import { Button, inputCls } from '../components/ui';

const MAX_FILE = 15 * 1024 * 1024;

/** Create an account: basic details, optional LinkedIn profile and resume, then an emailed code. */
export function SignupPage() {
  const loc = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(loc.search).get('email') ?? '');
  const [p, setP] = useState<SignupProfile>({});
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof SignupProfile) => (e: React.ChangeEvent<HTMLInputElement>) => setP((x) => ({ ...x, [k]: e.target.value }));

  const send = async () => {
    // the profile keeps one name field, used on resumes and in greetings
    const r = await auth.start(email, 'signup', { ...p, name: `${first.trim()} ${last.trim()}`.trim() });
    setSentTo(r.email);
  };

  if (sentTo)
    return (
      <AuthShell title="Check your email">
        <CodeStep
          email={sentTo}
          busyLabel={resume ? 'Creating account and uploading…' : 'Creating your account…'}
          onVerify={async (code) => {
            await auth.verify(code);
            if (resume) {
              // signed in now, so the existing import runs for the new account; progress shows on the Profile page
              const fd = new FormData();
              fd.append('file', resume);
              await api.importResume(fd).catch(() => {});
              location.assign('/profile');
            } else location.assign('/');
          }}
          onResend={send}
          onChangeEmail={() => setSentTo('')}
        />
      </AuthShell>
    );

  return (
    <AuthShell
      title="Create your account"
      sub="Tell us a little about yourself. You can change any of this later on your profile."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            await send();
          } catch (e: any) {
            setErr(e.message);
          }
          setBusy(false);
        }}
        className="space-y-4"
      >
        <FormError msg={err} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input required autoFocus autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Last name" required>
            <input required autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Email" required hint="We’ll send a sign-in code here">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input type="tel" autoComplete="tel" value={p.phone ?? ''} onChange={set('phone')} className={inputCls} />
          </Field>
          <Field label="Location">
            <input autoComplete="address-level2" value={p.location ?? ''} onChange={set('location')} placeholder="City, State" className={inputCls} />
          </Field>
        </div>
        <Field label="Current title">
          <input value={p.headline ?? ''} onChange={set('headline')} placeholder="e.g. Senior Data Engineer" className={inputCls} />
        </Field>
        <Field label="Roles you’re looking for">
          <input value={p.targetRoles ?? ''} onChange={set('targetRoles')} placeholder="e.g. Staff Engineer, Engineering Manager" className={inputCls} />
        </Field>

        <Field label="LinkedIn profile" hint="Optional">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              inputMode="url"
              value={p.linkedinUrl ?? ''}
              onChange={set('linkedinUrl')}
              onBlur={(e) => {
                // accept "linkedin.com/in/…" without the https://
                const v = e.target.value.trim();
                if (v && !/^https?:\/\//i.test(v)) setP((x) => ({ ...x, linkedinUrl: `https://${v}` }));
              }}
              placeholder="https://www.linkedin.com/in/your-name"
              className={inputCls + ' pl-9'}
            />
          </div>
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Resume <span className="font-normal text-slate-500">· Optional. PDF, Word, text or Markdown</span>
          </span>
          {resume ? (
            <div className="flex items-center gap-3 rounded-lg p-3 ring-1 ring-inset ring-slate-200">
              <FileText className="size-5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{resume.name}</div>
                <div className="text-xs text-slate-500">Imported as your master resume after you confirm your email.</div>
              </div>
              <button type="button" aria-label="Remove resume" onClick={() => setResume(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50/40"
            >
              <Upload className="size-4" /> Upload your resume
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > MAX_FILE) return setErr('That file is over 15 MB. Choose a smaller one.');
              setErr('');
              setResume(f);
            }}
          />
        </div>

        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Email me a code
        </Button>
        <p className="text-center text-xs text-slate-500">No password needed. You’ll sign in with a code we email you.</p>
      </form>
    </AuthShell>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
        {hint && <span className="font-normal text-slate-500"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}
