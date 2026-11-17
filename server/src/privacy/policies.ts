import type { ProviderConfig } from '../llm/providers.ts';

/**
 * What each kind of AI source does with the data it receives. The consent dialog and the Privacy Policy are built
 * from this, so neither can claim more than is written here. "unknown" is always shown as the worst case.
 *
 * Re-check every entry when its provider changes its terms, and update `verified`. A change that makes an entry
 * worse (e.g. training goes from "no" to "may") also needs AI_CONSENT_VERSION bumped in versions.ts.
 */

export type PolicyKey =
  | 'openrouter-included'
  | 'openrouter'
  | 'nararouter'
  | 'openai'
  | 'google'
  | 'huggingface'
  | 'local'
  | 'custom-remote'
  | 'claude-plan';

export type Level = 'no' | 'may' | 'unknown';

export interface SourcePolicy {
  key: PolicyKey;
  /** Who receives the data, in plain words. */
  recipient: string;
  /** False only when nothing leaves the user's own computer. */
  thirdParty: boolean;
  training: Level;
  trainingText: string;
  retention: 'none' | 'limited' | Level;
  retentionText: string;
  /** Set when people at the provider may read requests. */
  humanReview?: string;
  privacyUrl?: string;
  termsUrl?: string;
  /** Where the facts above come from, and when they were last checked. */
  sources: string[];
  verified: string;
}

const OPENROUTER_ROUTING = 'https://openrouter.ai/docs/guides/routing/provider-selection';

export const POLICIES: Record<PolicyKey, SourcePolicy> = {
  'openrouter-included': {
    key: 'openrouter-included',
    recipient: 'OpenRouter, which passes each request to the host of one free model',
    thirdParty: true,
    training: 'no',
    trainingText:
      'We tell OpenRouter to use only model hosts that don’t collect user data, so hosts that keep or train on prompts are skipped (provider setting data_collection: deny).',
    retention: 'limited',
    retentionText:
      'OpenRouter keeps request metadata (time, model, token counts) on the app’s account, not the prompt itself; prompt logging is off on that account. Hosts used under this setting don’t keep prompts after processing.',
    privacyUrl: 'https://openrouter.ai/privacy',
    termsUrl: 'https://openrouter.ai/terms',
    sources: [OPENROUTER_ROUTING, 'https://openrouter.ai/docs/guides/privacy/provider-logging'],
    verified: '2026-11-17',
  },
  openrouter: {
    key: 'openrouter',
    recipient: 'OpenRouter (your key), which passes each request to the host of the model you picked',
    thirdParty: true,
    training: 'no',
    trainingText:
      'We tell OpenRouter to use only model hosts that don’t collect user data, so hosts that keep or train on prompts are skipped (provider setting data_collection: deny).',
    retention: 'limited',
    retentionText:
      'OpenRouter only stores prompts if you turned on prompt logging in your OpenRouter account. Hosts used under this setting don’t keep prompts after processing.',
    privacyUrl: 'https://openrouter.ai/privacy',
    termsUrl: 'https://openrouter.ai/terms',
    sources: [OPENROUTER_ROUTING, 'https://openrouter.ai/docs/guides/privacy/provider-logging'],
    verified: '2026-11-17',
  },
  nararouter: {
    key: 'nararouter',
    recipient: 'NaraRouter (router.bynara.id) and the hosts of the models it tries',
    thirdParty: true,
    training: 'unknown',
    trainingText: 'NaraRouter doesn’t publish a data policy that we could find. Assume what you send may be used for training.',
    retention: 'unknown',
    retentionText: 'Unknown. Assume what you send may be kept.',
    sources: ['https://router.bynara.id'],
    verified: '2026-11-17',
  },
  openai: {
    key: 'openai',
    recipient: 'OpenAI (your key)',
    thirdParty: true,
    training: 'no',
    trainingText: 'OpenAI doesn’t train on API data unless the account owner opts in.',
    retention: 'limited',
    retentionText: 'Kept for up to 30 days in OpenAI’s abuse-monitoring logs, or longer if the law requires it.',
    privacyUrl: 'https://openai.com/policies/privacy-policy',
    termsUrl: 'https://openai.com/policies/business-terms',
    sources: ['https://developers.openai.com/api/docs/guides/your-data'],
    verified: '2026-11-17',
  },
  google: {
    key: 'google',
    recipient: 'Google, through the Gemini API (your key)',
    thirdParty: true,
    training: 'may',
    trainingText:
      'On the free tier, Google uses what you send to improve its products and machine-learning technology. Keys on a billing-enabled (paid) project are not used this way.',
    retention: 'may',
    retentionText: 'Kept under Google’s Gemini API terms.',
    humanReview: 'On the free tier, people at Google may read and annotate what you send.',
    privacyUrl: 'https://policies.google.com/privacy',
    termsUrl: 'https://ai.google.dev/gemini-api/terms',
    sources: ['https://ai.google.dev/gemini-api/terms'],
    verified: '2026-11-17',
  },
  huggingface: {
    key: 'huggingface',
    recipient: 'Hugging Face and the inference provider that serves your model (your key)',
    thirdParty: true,
    training: 'unknown',
    trainingText: 'Depends on the inference provider behind the model you picked.',
    retention: 'unknown',
    retentionText: 'Depends on the inference provider behind the model you picked.',
    privacyUrl: 'https://huggingface.co/privacy',
    termsUrl: 'https://huggingface.co/terms-of-service',
    sources: ['https://huggingface.co/docs/inference-providers'],
    verified: '2026-11-17',
  },
  local: {
    key: 'local',
    recipient: 'A model server on this computer',
    thirdParty: false,
    training: 'no',
    trainingText: 'Nothing leaves this computer.',
    retention: 'none',
    retentionText: 'Stays on this computer.',
    sources: [],
    verified: '2026-11-17',
  },
  'custom-remote': {
    key: 'custom-remote',
    recipient: 'The model server at the address you entered',
    thirdParty: true,
    training: 'unknown',
    trainingText: 'We don’t know this server’s data policy. Assume what you send may be used for training.',
    retention: 'unknown',
    retentionText: 'Unknown. Assume what you send may be kept.',
    sources: [],
    verified: '2026-11-17',
  },
  'claude-plan': {
    key: 'claude-plan',
    recipient: 'Anthropic, through your own Claude plan',
    thirdParty: true,
    training: 'may',
    trainingText: 'Used for training if “Help improve Claude” is on in your Claude privacy settings.',
    retention: 'may',
    retentionText: 'Kept for 30 days with that setting off, and up to 5 years with it on.',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
    sources: ['https://www.anthropic.com/news/updates-to-our-consumer-terms'],
    verified: '2026-11-17',
  },
};

/** Web search on non-Claude sources goes to DuckDuckGo (llm/builtins.ts). */
export const WEB_SEARCH = {
  recipient: 'DuckDuckGo (web search)',
  text: 'Cover letters, interview prep, the copilot, and scans of hard-to-read postings may search the web. DuckDuckGo receives the search text, such as a company and role name. Searches that contain your name or contact details are blocked.',
  privacyUrl: 'https://duckduckgo.com/privacy',
};

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/** The policy that applies to a configured source. */
export function policyKeyOf(p: Pick<ProviderConfig, 'id' | 'kind' | 'baseUrl'>): PolicyKey {
  if (p.id === 'included-free') return 'openrouter-included';
  switch (p.kind) {
    case 'openrouter':
      return 'openrouter';
    case 'nararouter':
      return 'nararouter';
    case 'openai':
      return 'openai';
    case 'google':
      return 'google';
    case 'huggingface':
      return 'huggingface';
    case 'claude':
      return 'claude-plan';
    case 'lmstudio':
    case 'openai-compatible':
      // On Vercel "localhost" is the server, not the user's computer, so it can't be local there.
      return LOCAL_HOST.test(p.baseUrl) && !process.env.VERCEL ? 'local' : 'custom-remote';
  }
}

export const policyOf = (p: Pick<ProviderConfig, 'id' | 'kind' | 'baseUrl'>) => POLICIES[policyKeyOf(p)];
