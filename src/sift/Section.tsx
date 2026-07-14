/**
 * Section — collapsible group with a clickable header.
 *
 * DOM output (minimal):
 *   details.sf-section [open?]
 *     summary.sf-section-title
 *       {title}
 *       button (reset, conditional)
 *     {children}
 *
 * Uses native <details>/<summary> for collapse — zero JS for toggle,
 * accessible by default, minimal DOM.
 */

import type { ReactElement, ReactNode } from 'react';

export function Section(props: {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly reset?: { readonly onClick: () => void; readonly modified: boolean } | null;
  readonly className?: string;
}): ReactElement {
  const { title, children, defaultOpen = false, reset, className } = props;
  return (
    <details
      className={`sf-section${className ? ` ${className}` : ''}`}
      open={defaultOpen || undefined}
    >
      <summary className="sf-section-title">
        <span className="sf-section-title__text">{title}</span>
        {reset && (
          <button
            type="button"
            className={`sf-section-reset${reset.modified ? ' is-modified' : ''}`}
            onClick={(e) => { e.preventDefault(); reset.onClick(); }}
            disabled={!reset.modified}
            aria-label={`Reset ${title}`}
          >
            ↻
          </button>
        )}
      </summary>
      {children}
    </details>
  );
}
