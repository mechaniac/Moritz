/**
 * Slider — labeled range input with numeric readout.
 *
 * DOM output (minimal):
 *   label.sf-slider
 *     span.sf-slider-label    ← text label
 *     input[type=range]       ← the slider
 *     input[type=number]      ← numeric readout/edit
 *
 * Total depth: 2 (label → inputs). No wrapper divs.
 */

import type { ReactElement } from 'react';

export function Slider(props: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly defaultValue?: number;
  readonly tooltip?: string;
  readonly className?: string;
}): ReactElement {
  const { label, value, onChange, min = 0, max = 1, step = 0.01, tooltip, className } = props;
  const modified = props.defaultValue !== undefined && value !== props.defaultValue;
  return (
    <label
      className={`sf-slider${modified ? ' is-modified' : ''}${className ? ` ${className}` : ''}`}
      title={tooltip}
    >
      <span className="sf-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sf-slider-num"
      />
    </label>
  );
}
