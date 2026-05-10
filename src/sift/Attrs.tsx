/**
 * Attributes panel: the right inspector. Sections + label/control rows.
 * Use `<Attrs>` as the wrapper and `<AttrSection>` / `<AttrRow>` inside.
 */

import type { ReactNode } from 'react';

export function Attrs(props: { children: ReactNode }): JSX.Element {
  return <div className="sf-attrs">{props.children}</div>;
}

export function AttrSection(props: {
  title?: ReactNode;
  imp?: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="sf-attrs__section" data-imp={props.imp ?? 1}>
      {props.title != null && (
        <header className="sf-attrs__section-title">{props.title}</header>
      )}
      {props.children}
    </section>
  );
}

export function AttrRow(props: {
  label: ReactNode;
  /** Importance of the row (label + control). */
  imp?: number;
  /** Indicates the control's value differs from its preset/default. */
  changed?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="sf-attrs__row"
      data-imp={props.imp ?? 1}
      data-changed={props.changed ? 'true' : undefined}
    >
      <label className="sf-attrs__label">{props.label}</label>
      <div>{props.children}</div>
    </div>
  );
}
