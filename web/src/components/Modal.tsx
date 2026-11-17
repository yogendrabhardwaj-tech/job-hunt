import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/format';

/** Open dialogs, innermost last: only the top one handles Esc and Tab (a policy opened from the consent dialog). */
const stack: HTMLElement[] = [];

/**
 * An accessible dialog: focus moves in when it opens, Tab stays inside, Esc closes it (when allowed) and focus
 * returns to whatever opened it. Full screen on phones, a centred card from 640px.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  dismissable = true,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  /** False for dialogs the user has to answer (Esc and clicking outside do nothing). */
  dismissable?: boolean;
  size?: 'md' | 'lg';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(
        (x) => x.offsetParent !== null || x === document.activeElement,
      );
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus();
    stack.push(el);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === 'Escape' && dismissable) {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      stack.splice(stack.indexOf(el), 1);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cx(
          'flex max-h-full w-full flex-col bg-white shadow-2xl outline-none sm:max-h-[min(90vh,900px)] sm:rounded-2xl sm:ring-1 sm:ring-slate-200',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
