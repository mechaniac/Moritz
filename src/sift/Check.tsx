/**
 * Check — labeled checkbox.
 *
 * DOM output (minimal):
 *   label.sf-check
 *     input[type=checkbox]
 *     span.sf-check-label
 *
 * Total depth: 2 (label → input). No wrappers.
 */

import type { ReactElement } from 'react';

export function Check(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly tooltip?: string;
  readonly className?: string;
}): ReactElement {
  const { label, checked, onChange, tooltip, className } = props;
  return (
    <label
      className={`sf-check${className ? ` ${className}` : ''}`}
      title={tooltip}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sf-check-label">{label}</span>
    </label>
  );
}
