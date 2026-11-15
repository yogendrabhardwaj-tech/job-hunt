/**
 * Browser-tab session used for bring-your-own-key. API keys the user chooses not to save are held by the
 * server in memory under this id. The id lives in sessionStorage, so it survives a reload but not closing
 * the tab. The server forgets the keys a few seconds after the tab closes (beacon), or a few minutes after
 * the last heartbeat if the beacon never arrives.
 */

const STORE = 'jh.sessionId';

function makeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const sessionId: string = (() => {
  try {
    const v = sessionStorage.getItem(STORE);
    if (v) return v;
    const id = makeId();
    sessionStorage.setItem(STORE, id);
    return id;
  } catch {
    return makeId(); // storage blocked: keys last for this page load only
  }
})();

const beat = () =>
  fetch('/api/session/heartbeat', { method: 'POST', headers: { 'x-session-id': sessionId } }).catch(() => {});

export function startSession() {
  beat();
  setInterval(beat, 30_000);
  // coming back to a backgrounded tab: check in straight away in case timers were throttled
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beat());
  addEventListener('pageshow', (e) => e.persisted && beat());
  addEventListener('pagehide', () => navigator.sendBeacon('/api/session/end', new Blob([sessionId], { type: 'text/plain' })));
}
