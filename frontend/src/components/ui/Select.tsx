import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type SelectOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Plain-text fallback used for the trigger + type-ahead when label is a node. */
  text?: string;
};

type Props<T extends string | number> = {
  value: T | null | undefined;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Small muted label rendered before the current value (e.g. "Sort"). */
  prefix?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Minimum width of the popover menu; defaults to the trigger width. */
  menuMinWidth?: number;
  align?: 'left' | 'right';
};

const CHEVRON = (
  <svg
    className="dg-select-chevron"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M2.5 4.5L6 8l3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CHECK = (
  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M2.5 6.2L4.8 8.5L9.5 3.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function optionText<T extends string | number>(o: SelectOption<T>): string {
  if (o.text != null) return o.text;
  if (typeof o.label === 'string' || typeof o.label === 'number') return String(o.label);
  return String(o.value);
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  prefix,
  placeholder = 'Select…',
  ariaLabel,
  disabled,
  className,
  style,
  menuMinWidth,
  align = 'left',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<{ query: string; at: number }>({ query: '', at: 0 });

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  // Position the menu against the trigger once it's rendered.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  const openMenu = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  // Reposition on scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, reposition]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const menu = menuRef.current;
    const node = menu?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = useCallback(
    (i: number) => {
      const o = options[i];
      if (o) onChange(o.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [options, onChange],
  );

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((i) => {
        const n = options.length;
        if (n === 0) return -1;
        return i < 0 ? (delta > 0 ? 0 : n - 1) : (i + delta + n) % n;
      });
    },
    [options.length],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!open) openMenu();
          else moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!open) openMenu();
          else moveActive(-1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!open) openMenu();
          else if (activeIndex >= 0) commit(activeIndex);
          break;
        case 'Escape':
          if (open) {
            e.preventDefault();
            setOpen(false);
          }
          break;
        case 'Home':
          if (open) {
            e.preventDefault();
            setActiveIndex(0);
          }
          break;
        case 'End':
          if (open) {
            e.preventDefault();
            setActiveIndex(options.length - 1);
          }
          break;
        default: {
          // Type-ahead
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const now = Date.now();
            const q = now - typeahead.current.at > 700 ? e.key : typeahead.current.query + e.key;
            typeahead.current = { query: q, at: now };
            const lower = q.toLowerCase();
            const found = options.findIndex((o) => optionText(o).toLowerCase().startsWith(lower));
            if (found >= 0) {
              setOpen(true);
              setActiveIndex(found);
            }
          }
        }
      }
    },
    [open, activeIndex, moveActive, commit, options, openMenu],
  );

  const triggerLabel = selected ? optionText(selected) : placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`dg-select-trigger${open ? ' is-open' : ''}${className ? ' ' + className : ''}`}
        style={style}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {prefix && <span className="dg-select-prefix">{prefix}</span>}
        <span className={`dg-select-value${selected ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {CHEVRON}
        {/* visually-hidden text so getBoundingClientRect width includes it even for node labels */}
        <span aria-hidden="true" style={{ position: 'absolute', width: 0, overflow: 'hidden' }}>
          {triggerLabel}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="dg-select-menu"
            style={{
              position: 'fixed',
              top: pos.top,
              ...(align === 'right'
                ? { right: window.innerWidth - (pos.left + pos.width) }
                : { left: pos.left }),
              minWidth: menuMinWidth ?? pos.width,
            }}
            onKeyDown={onKeyDown}
          >
            {options.map((o, i) => {
              const isSelected = i === selectedIndex;
              const isActive = i === activeIndex;
              return (
                <div
                  key={String(o.value)}
                  role="option"
                  aria-selected={isSelected}
                  className={`dg-select-option${isActive ? ' is-active' : ''}${
                    isSelected ? ' is-selected' : ''
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(i)}
                >
                  <span className="dg-select-option-label">{o.label}</span>
                  <span className="dg-select-option-check">{isSelected && CHECK}</span>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

export default Select;
