import { useRef, useEffect, type ReactElement } from 'react';

/**
 * React component that mounts a real DOM node into the React tree.
 * Used to bridge magdalena's frameworkless components (which return HTMLElement)
 * into Moritz's React component hierarchy.
 */
export function DomBridge(props: { node: HTMLElement | null }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.textContent = '';
    if (props.node) {
      container.appendChild(props.node);
    }
  }, [props.node]);

  return <div ref={ref} style={{ display: 'contents' }} />;
}
