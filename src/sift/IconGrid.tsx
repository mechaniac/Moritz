/**
 * IconGrid — a flex-wrap grid of selectable thumbnail cells.
 *
 * DOM output (minimal):
 *   div.sf-icon-grid          ← flex-wrap container
 *     button.sf-icon-cell     ← per-item click target (×N)
 *       {renderThumb}         ← caller-provided content
 *       span.sf-icon-label    ← optional label
 *
 * Total depth: 3 elements (grid → button → content).
 */

import type { ReactElement, ReactNode } from 'react';

export interface IconGridItem {
  readonly id: string;
  readonly label?: string;
}

export function IconGrid<T extends IconGridItem>(props: {
  readonly items: readonly T[];
  readonly selected?: string;
  readonly onSelect: (item: T) => void;
  readonly renderThumb: (item: T) => ReactNode;
  readonly cellWidth?: number;
  readonly cellHeight?: number;
  readonly gap?: number;
  readonly className?: string;
}): ReactElement {
  const { items, selected, onSelect, renderThumb, gap = 4, className } = props;
  return (
    <div
      className={`sf-icon-grid${className ? ` ${className}` : ''}`}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap }}
    >
      {items.map((item) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            className={`sf-icon-cell${active ? ' is-active' : ''}`}
            data-id={item.id}
            onClick={() => onSelect(item)}
            title={item.label ?? item.id}
            type="button"
          >
            {renderThumb(item)}
            {item.label !== undefined && (
              <span className="sf-icon-label">{item.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
