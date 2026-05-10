/**
 * Workbench — fullscreen container that hosts the stage (the app's main
 * canvas/page) and any number of floating windows. Use this as the top-
 * level layout inside <SiftRoot>.
 */

import type { ReactNode } from 'react';

export function Workbench(props: {
  /** The fullscreen content underneath all floating windows. */
  stage: ReactNode;
  /** Floating windows. Order doesn't matter — z-index is on .sf-window. */
  windows?: ReactNode;
  /** Top-level overlays (debug popover, toasts). */
  overlays?: ReactNode;
}): JSX.Element {
  return (
    <div className="sf-app">
      <div className="sf-stage">{props.stage}</div>
      {props.windows}
      {props.overlays}
    </div>
  );
}
