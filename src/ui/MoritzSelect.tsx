import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { MoritzLabel } from './MoritzText.js';

export type MoritzSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function MoritzSelect(props: {
  value: string;
  options: readonly MoritzSelectOption[];
  onChange: (value: string) => void;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const { value, options, onChange, size = 11 } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () =>
      options.find((option) => option.value === value && !option.disabled) ??
      options.find((option) => option.value === value) ??
      options.find((option) => !option.disabled) ??
      options[0],
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={props.className}
      title={props.title}
      style={{ position: 'relative', minWidth: 0, ...props.style }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 24,
          padding: '2px 7px',
          border: '1px solid var(--mg-line)',
          borderRadius: 4,
          background: 'color-mix(in srgb, var(--mg-input) var(--mg-input-bg-mix), var(--mg-surface-3))',
          color: 'var(--mg-input-text)',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden' }}>
          <MoritzLabel text={selected?.label ?? ''} size={size} />
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid var(--mg-control-mark)',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 1000,
            left: 0,
            right: 0,
            top: 'calc(100% + 2px)',
            maxHeight: 220,
            overflowY: 'auto',
            padding: 3,
            border: '1px solid var(--mg-line)',
            borderRadius: 4,
            background: 'var(--mg-surface-1)',
            boxShadow: '0 8px 24px rgba(0,0,0,.22)',
          }}
        >
          {options.map((option, index) => {
            const active = option.value === value && !option.disabled;
            return (
              <button
                key={`${option.value}:${index}`}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: option.disabled ? 21 : 24,
                  padding: option.disabled ? '2px 6px' : '3px 6px',
                  border: 'none',
                  borderRadius: 3,
                  background: active
                    ? 'color-mix(in srgb, var(--mg-tone-relevant) 18%, transparent)'
                    : 'transparent',
                  color: option.disabled ? 'var(--mg-text-faint)' : 'var(--mg-text)',
                  cursor: option.disabled ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <MoritzLabel text={option.label} size={option.disabled ? Math.max(8, size - 1) : size} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
