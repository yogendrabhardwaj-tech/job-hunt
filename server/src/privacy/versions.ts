/**
 * Versions of everything a user agrees to or acknowledges. Bumping one makes existing records out of date:
 *   - AI_CONSENT_VERSION or PRIVACY_VERSION or TERMS_VERSION → AI consent must be given again before the next AI run
 *   - PRIVACY_VERSION → every user has to acknowledge the Privacy Policy again after signing in
 * Bump AI_CONSENT_VERSION whenever what is sent, or who it can go to, changes in a way users would care about.
 */
export const AI_CONSENT_VERSION = '1.0';

export const PRIVACY_VERSION = '1.0';
export const PRIVACY_EFFECTIVE_DATE = '2026-11-17';

/** No Terms of Service yet (issue #27). While null, consent copy leaves Terms out rather than linking to nothing. */
export const TERMS_VERSION: string | null = null;

/** Version of the sign-up page's privacy section, stored with each acknowledgment. */
export const SIGNUP_PAGE_VERSION = '1.0';

/** Build the app was running when a record was written. */
export const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || 'dev';

export const versions = () => ({
  aiConsentVersion: AI_CONSENT_VERSION,
  privacyVersion: PRIVACY_VERSION,
  privacyEffectiveDate: PRIVACY_EFFECTIVE_DATE,
  termsVersion: TERMS_VERSION,
});
