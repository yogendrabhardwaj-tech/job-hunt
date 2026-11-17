/**
 * The bridge between "the server refused an AI request for lack of consent" and the consent dialog (issue #22).
 * api.ts calls requestConsent() when it gets AI_PROCESSING_CONSENT_REQUIRED; the ConsentHost in the app shell shows
 * the dialog and answers true (agreed, so retry) or false (cancelled).
 */

export interface ConsentRequest {
  error?: string;
  message?: string;
  reason?: 'missing' | 'expired' | 'withdrawn' | 'feature_off' | 'sources_changed';
  feature?: string;
}

type Listener = (r: ConsentRequest, done: (agreed: boolean) => void) => void;

let listener: Listener | null = null;
let open: Promise<boolean> | null = null;

export function onConsentRequest(l: Listener) {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}

/** Shows the consent dialog (once, however many requests are waiting) and resolves when the user decides. */
export function requestConsent(r: ConsentRequest): Promise<boolean> {
  if (!listener) return Promise.resolve(false);
  open ??= new Promise<boolean>((resolve) =>
    listener!(r, (agreed) => {
      open = null;
      resolve(agreed);
    }),
  );
  return open;
}

/** Thrown when the user cancels the consent dialog, so callers can show a calm message instead of an error. */
export class ConsentDeclinedError extends Error {
  code = 'AI_PROCESSING_CONSENT_REQUIRED';
}

export const isConsentRequired = (data: any) => data?.error === 'AI_PROCESSING_CONSENT_REQUIRED';
