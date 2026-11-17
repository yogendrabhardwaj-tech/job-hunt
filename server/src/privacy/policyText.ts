import { POLICIES, WEB_SEARCH } from './policies.ts';
import { defaultPreferences, sentTable } from './consent.ts';
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION } from './versions.ts';

/**
 * The Privacy Policy (issue #26), as Markdown. One source for the /privacy page and the emailed copy.
 * The AI section is built from the provider registry and the "what we send" table, so it can't drift from the code.
 *
 * Still a draft: it needs a lawyer's review (decision D1 in #17) before it is final. Set PRIVACY_OPERATOR and
 * PRIVACY_CONTACT so readers know who runs the app and where to send requests.
 */
export const PRIVACY_DRAFT = true;

const PRIVACY_PATH = '/privacy';

export function policyTitle() {
  return `Job Hunt Alpha Privacy Policy, version ${PRIVACY_VERSION}`;
}

export function policyMarkdown(appUrl?: string): string {
  const operator = process.env.PRIVACY_OPERATOR?.trim();
  const contact = process.env.PRIVACY_CONTACT?.trim();
  const url = appUrl ? `${appUrl}${PRIVACY_PATH}` : PRIVACY_PATH;
  const sent = sentTable(defaultPreferences());
  const thirdParty = Object.values(POLICIES).filter((p) => p.thirdParty);

  const recipients = thirdParty
    .map((p) => {
      const links = [p.privacyUrl && `[privacy policy](${p.privacyUrl})`, p.termsUrl && `[terms](${p.termsUrl})`].filter(Boolean).join(', ');
      return [
        `- **${p.recipient}.**`,
        `  - Training: ${p.trainingText}`,
        `  - Keeping data: ${p.retentionText}`,
        ...(p.humanReview ? [`  - People reading it: ${p.humanReview}`] : []),
        ...(links ? [`  - ${links}`] : []),
      ].join('\n');
    })
    .join('\n');

  return `# Privacy Policy

**Version ${PRIVACY_VERSION}** · Effective ${PRIVACY_EFFECTIVE_DATE} · ${url}

${PRIVACY_DRAFT ? '> This policy is a draft and is still being reviewed. It describes what the app does today.\n' : ''}
## Who we are

Job Hunt Alpha is a job-search workspace${operator ? ` run by ${operator}` : ''}. ${contact ? `For questions or requests about your data, contact ${contact}.` : 'Contact details for privacy requests will be added here before launch.'}

## What we collect

- **Your account:** your email address, used to sign you in. There are no passwords.
- **Sign-up details you choose to give:** name, phone, location, current title, the roles you're looking for and your LinkedIn profile link.
- **Your resume:** the file you upload (we keep a copy of the original), the text we extract from it, your master resume, the tailored copies, and the cover letters and interview prep made for you.
- **Job postings** you add, with the notes, statuses and activity on each.
- **Achievements notes and LinkedIn profile text**, if you add them.
- **AI-source settings.** API keys you enter are kept only for your browser session, unless you choose to save them.
- **Daily usage counts:** runs, requests, token counts and failures. These never include what was sent.
- **Your consent and acknowledgment records:** what you agreed to, which version, and when.
- **A sign-in cookie.** We don't use advertising or analytics cookies.

## Why we use it

- To do what you ask: track your applications, score and tailor your resume, and draft documents.
- To sign you in and keep your account secure.
- To keep a record of what you agreed to.

We don't sell your data, and we don't use it for advertising.

## AI processing

Your resume and job information are only sent to an AI service after you agree on the **AI Resume Processing** screen. You can turn single features off, or withdraw your consent, at any time on the Privacy page in the app.

What we send:

${sent.map((r) => `- **${r.item}:** ${r.sent === 'yes' ? 'sent' : 'not sent'}. ${r.detail}.`).join('\n')}

Who may receive it depends on the AI sources turned on in your account. The consent screen lists yours. These are all the kinds of source the app can use:

${recipients}

If one source fails, the same request can go to another source you've turned on, but only to a source your consent covers. A model running on your own computer receives the data without it leaving that computer.

**Web search.** ${WEB_SEARCH.text} See DuckDuckGo's [privacy policy](${WEB_SEARCH.privacyUrl}).

## Where your data is stored

In a private storage area on Vercel, our hosting provider. Files there can't be reached publicly. AI providers listed above may process data in other countries, including the United States.

## How long we keep it

- Your profile, resumes, uploaded files, job postings and documents: until you delete them, or delete your resume data on the Privacy page.
- Daily usage counts: 180 days.
- Consent and deletion records: for as long as your account exists, so we can show what you agreed to and when.
- What AI providers keep: see their terms above.

## Your choices and rights

- **See and correct** your details on the Profile page.
- **Turn AI features on or off, or withdraw consent,** on the Privacy page. After you withdraw, nothing new is sent. What was already created stays until you delete it.
- **Delete your resume and AI-generated content** on the Privacy page.
- **Anything else,** such as a copy of your data or an objection: ${contact ? `contact ${contact}` : 'use the contact details above'}.

What we can't undo: requests already sent to an AI provider are covered by that provider's terms. None of the providers we use let us delete them for you.

## Age

You must be 18 or older to use Job Hunt Alpha.

## Changes

When this policy changes, we update the version and date at the top. If the change matters, we ask you to review it the next time you sign in, and AI features stay off until you agree to the new terms.
`;
}

/** Plain-text version for the emailed copy. */
export function policyText(appUrl?: string): string {
  return policyMarkdown(appUrl)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^> /gm, '')
    .replace(/^#+ /gm, '');
}
