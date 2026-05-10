/**
 * Outliner / tree view. Stateless: caller passes `nodes` and selection
 * callbacks; expansion state is managed internally per `id` so the user
 * can twirl branches without the data model caring.
 *
 * Node shape is intentionally generic: a tree of `{ id, label, ... }`
 * with optional `children`. Each row is a `.sf-tree__row`.
 */

import { useState, type ReactNode } from 'react';

export type TreeNode = {
  id: string;
  label: ReactNode;
  /** Single-character or short tag rendered before the label. */
  icon?: ReactNode;
  /** Importance of this row (overrides default). */
  imp?: number;
  /** Right-justified annotation (run count, glyph index, etc.) */
  hint?: ReactNode;
  children?: TreeNode[];
  /** Hard-disable expansion even if `children` is non-empty. */
  alwaysLeaf?: boolean;
};

export function Tree(props: {
  nodes: TreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Optional double-click / Enter handler. */
  onActivate?: (id: string) => void;
  /** Initially expanded ids. */
  defaultExpanded?: string[];
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(props.defaultExpanded ?? []),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="sf-tree">
      {props.nodes.map((n) => (
        <Row
          key={n.id}
          node={n}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          onActivate={props.onActivate}
        />
      ))}
    </div>
  );
}

function Row(props: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
}): JSX.Element {
  const { node, depth } = props;
  const hasChildren =
    !node.alwaysLeaf && Array.isArray(node.children) && node.children.length > 0;
  const open = props.expanded.has(node.id);
  const isSel = props.selectedId === node.id;

  return (
    <>
      <div
        className={`sf-tree__row${isSel ? ' sf-tree__row--selected' : ''}`}
        style={{ paddingLeft: `calc(var(--sf-pad) + ${depth * 14}px)` }}
        data-imp={node.imp ?? 1}
        onClick={() => props.onSelect?.(node.id)}
        onDoubleClick={() => props.onActivate?.(node.id)}
      >
        <span
          className={`sf-tree__caret sf-tree__caret--${
            hasChildren ? (open ? 'open' : 'closed') : 'leaf'
          }`}
          onClick={(e) => {
            if (!hasChildren) return;
            e.stopPropagation();
            props.toggle(node.id);
          }}
        />
        {node.icon != null && <span className="sf-tree__icon">{node.icon}</span>}
        <span className="sf-tree__label">{node.label}</span>
        {node.hint != null && (
          <span className="sf-tree__icon" data-imp={0}>
            {node.hint}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <>
          {node.children!.map((c) => (
            <Row
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={props.expanded}
              toggle={props.toggle}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
              onActivate={props.onActivate}
            />
          ))}
        </>
      )}
    </>
  );
}
