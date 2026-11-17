import { describe, expect, it } from 'vitest';
import { codecFor, streamRestorer } from '../src/privacy/redact.ts';

const profile = {
  name: 'Jane Q. Doe',
  email: 'jane.doe@example.com',
  phone: '302-555-0142',
  location: 'Wilmington, DE',
  linkedinUrl: 'https://www.linkedin.com/in/jane-doe',
};

const resume = `# Jane Q. Doe
jane.doe@example.com · (302) 555-0142 · Wilmington, DE · linkedin.com/in/jane-doe · github.com/janedoe

## Summary
Jane Doe led a team of 12. Reach Doe at 12 Main Street, Apt 4.

## References
Bob Smith, bob@acme.com, +44 20 7946 0958`;

const PII = ['jane.doe@example.com', '302-555-0142', '(302) 555-0142', 'Wilmington, DE', 'jane-doe', 'janedoe', 'Jane', 'Doe', '12 Main Street', 'bob@acme.com', '7946 0958'];

describe('redaction codec', () => {
  it('replaces contact details and the name, and puts them back exactly', () => {
    const c = codecFor(profile, { includeName: false });
    const red = c.redact(resume);
    for (const v of PII) expect(red, v).not.toContain(v);
    expect(red).toContain('# [[NAME]]');
    expect(red).toContain('[[EMAIL]]');
    expect(red).toContain('[[LOCATION]]');
    expect(c.restore(red)).toBe(resume);
  });

  it('keeps the name when the user chose to include it', () => {
    const c = codecFor(profile, { includeName: true });
    const red = c.redact(resume);
    expect(red).toContain('# Jane Q. Doe');
    expect(red).not.toContain('jane.doe@example.com');
  });

  it('gives the same unknown value the same placeholder in every run', () => {
    const a = codecFor(profile, { includeName: false }).redact('bob@acme.com');
    const b = codecFor(profile, { includeName: false }).redact('contact bob@acme.com');
    expect(a).toMatch(/^\[\[EMAIL_[0-9a-f]{6}\]\]$/);
    expect(b).toContain(a);
  });

  it('restores values the model writes back into tool arguments', () => {
    const c = codecFor(profile, { includeName: false }, [resume]);
    const args = { markdown: '# [[NAME]]\n[[EMAIL]] · [[PHONE]]', changes: ['Kept [[LINKEDIN]]'] };
    expect(c.restoreDeep(args)).toEqual({ markdown: '# Jane Q. Doe\njane.doe@example.com · 302-555-0142', changes: ['Kept https://www.linkedin.com/in/jane-doe'] });
  });

  it('flags searches that carry personal details', () => {
    const c = codecFor(profile, { includeName: false });
    expect(c.sensitive('Jane Doe Acme engineer')).toBe(true);
    expect(c.sensitive('[[NAME]] Acme')).toBe(true);
    expect(c.sensitive('call 302-555-0142')).toBe(true);
    expect(c.sensitive('Acme Corp Solution Architect interview')).toBe(false);
  });

  it('restores a placeholder split across streamed chunks', () => {
    const c = codecFor(profile, { includeName: false });
    const s = streamRestorer(c);
    const out = s.push('Hello [[NA') + s.push('ME]], your email is [[EM') + s.push('AIL]].') + s.flush();
    expect(out).toBe('Hello Jane Q. Doe, your email is jane.doe@example.com.');
  });
});
