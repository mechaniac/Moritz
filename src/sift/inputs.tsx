/**
 * Sift base inputs. Designed so closely-bound parts (track + knob,
 * box + tick) share colours via the `--sf-close` variable, satisfying
 * the local-contrast rule.
 */

import {
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PointerEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

// ---------- Button ---------------------------------------------------------

export type Tone = 'default' | 'go' | 'note' | 'hot' | 'warn';
export type Variant = 'ghost' | 'solid';

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: Tone;
    variant?: Variant;
    imp?: number;
  },
): JSX.Element {
  const { tone, variant, imp, className, ...rest } = props;
  const tc =
    tone && tone !== 'default'
      ? variant === 'solid'
        ? `sf-button--solid-${tone}`
        : `sf-button--${tone}`
      : '';
  return (
    <button
      {...rest}
      data-imp={imp ?? 1}
      className={`sf-button ${tc} ${className ?? ''}`.trim()}
    />
  );
}

// ---------- Text / number input -------------------------------------------

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    changed?: boolean;
    imp?: number;
  },
): JSX.Element {
  const { changed, imp, className, ...rest } = props;
  return (
    <input
      {...rest}
      data-changed={changed ? 'true' : undefined}
      data-imp={imp ?? 1}
      className={`sf-input ${className ?? ''}`.trim()}
    />
  );
}

export function NumberInput(props: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  changed?: boolean;
  imp?: number;
}): JSX.Element {
  return (
    <TextInput
      type="number"
      value={Number.isFinite(props.value) ? props.value : 0}
      step={props.step}
      min={props.min}
      max={props.max}
      changed={props.changed}
      imp={props.imp}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) props.onChange(n);
      }}
    />
  );
}

// ---------- Slider ---------------------------------------------------------

export function Slider(props: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  changed?: boolean;
  imp?: number;
  className?: string;
}): JSX.Element {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const step = props.step ?? (max - min) / 100;
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClient = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const t = (clientX - rect.left) / rect.width;
    const raw = min + (max - min) * Math.max(0, Math.min(1, t));
    const snapped = step > 0 ? Math.round(raw / step) * step : raw;
    props.onChange(Math.max(min, Math.min(max, snapped)));
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    setFromClient(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setFromClient(e.clientX);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const t = max > min ? (props.value - min) / (max - min) : 0;
  const pct = `${(Math.max(0, Math.min(1, t)) * 100).toFixed(1)}%`;

  return (
    <div
      ref={ref}
      className={`sf-slider ${props.className ?? ''}`.trim()}
      data-changed={props.changed ? 'true' : undefined}
      data-imp={props.imp ?? 1}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div className="sf-slider__track" />
      <div className="sf-slider__fill" style={{ width: pct }} />
      <div className="sf-slider__knob" style={{ left: pct }} />
    </div>
  );
}

// ---------- Checkbox ------------------------------------------------------

export function Checkbox(props: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  changed?: boolean;
  imp?: number;
}): JSX.Element {
  return (
    <span
      className="sf-checkbox"
      data-on={props.value ? 'true' : 'false'}
      data-changed={props.changed ? 'true' : undefined}
      data-imp={props.imp ?? 1}
      onClick={() => props.onChange(!props.value)}
      role="checkbox"
      aria-checked={props.value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          props.onChange(!props.value);
        }
      }}
    >
      <span className="sf-checkbox__box">
        <span className="sf-checkbox__tick" />
      </span>
      {props.label != null && <span>{props.label}</span>}
    </span>
  );
}

// ---------- Select --------------------------------------------------------

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & {
    changed?: boolean;
    imp?: number;
  },
): JSX.Element {
  const { changed, imp, className, ...rest } = props;
  return (
    <select
      {...rest}
      data-changed={changed ? 'true' : undefined}
      data-imp={imp ?? 1}
      className={`sf-select ${className ?? ''}`.trim()}
    />
  );
}
