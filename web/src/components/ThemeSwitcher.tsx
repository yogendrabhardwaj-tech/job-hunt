import { THEMES, useTheme, type ThemeKey } from '../lib/theme';
import { cx } from '../lib/format';

/** Three round swatches that switch the colour theme. Made for dark backgrounds. */
export function ThemeSwitcher({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const [theme, setTheme] = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className={cx('flex gap-0.5 rounded-full border border-white/10 bg-white/4 p-0.5', className)}>
      {(Object.keys(THEMES) as ThemeKey[]).map((k) => {
        const on = k === theme;
        return (
          <button
            key={k}
            type="button"
            onClick={() => setTheme(k)}
            aria-label={`${THEMES[k].label} theme`}
            aria-pressed={on}
            title={THEMES[k].label}
            className={cx(
              'flex cursor-pointer items-center justify-center rounded-full',
              size === 'md' ? 'size-10' : 'size-8',
              on ? 'bg-white/12' : 'hover:bg-white/6',
            )}
          >
            <span
              className={cx('rounded-full', size === 'md' ? 'size-[18px]' : 'size-4')}
              style={{
                background: `linear-gradient(135deg, ${THEMES[k].a}, ${THEMES[k].b})`,
                boxShadow: on ? '0 0 0 2px #05070f, 0 0 0 3.5px #ffffff' : 'none',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** The app logo: the mountain mark on the theme gradient. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cx('flex shrink-0 items-center justify-center', className ?? 'size-8 rounded-[9px]')}
      style={{
        background: 'linear-gradient(135deg, var(--jha-acc), var(--jha-sec))',
        boxShadow: '0 6px 20px -4px var(--jha-glow), inset 0 1px 0 rgba(255,255,255,0.35)',
      }}
    >
      <svg viewBox="0 0 32 32" className="size-[60%]" aria-hidden>
        <path d="M7 22l5-11 4 7 2.5-3.5L25 22" stroke="white" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
