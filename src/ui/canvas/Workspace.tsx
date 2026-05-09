/**
 * <Workspace> — the shared shell for every editor canvas.
 *
 * Pulls together the three things every workspace needs identically:
 *   1. A wrapper div whose size is observed (`useCanvasSize`)
 *   2. A `<svg>` filling that wrapper, sized by viewBox = "0 0 w h"
 *   3. The shared input behaviours (`useCanvasInput`): wheel + pinch
 *      zoom, space-pan tracking
 *
 * The workspace-specific painting (background fill, marquee drag,
 * world-coord override, foreground content, handles) is left to
 * `children`, which receives the live size + svgRef + a `screenToWorld`
 * helper. This keeps the shell shape-agnostic — same component for
 * GlyphSetter / StyleSetter / BubbleSetter / TypeSetter.
 *
 * Usage:
 *   <Workspace
 *     camera={{ zoom, panX, panY }}
 *     setCamera={(c) => ...}
 *     panMode="both"
 *   >
 *     {({ width, height, spaceDown }) => (
 *       <>
 *         <rect width={width} height={height} fill="..." />
 *         ...
 *       </>
 *     )}
 *   </Workspace>
 */

import { useRef } from 'react';
import { useCanvasInput, type CameraSnapshot } from './useCanvasInput.js';
import { useCanvasSize } from './useCanvasSize.js';

export type WorkspacePanMode = 'both' | 'space' | 'middle' | 'none';

export type WorkspaceChildArgs = {
  readonly width: number;
  readonly height: number;
  readonly spaceDown: boolean;
  readonly svgRef: React.RefObject<SVGSVGElement | null>;
};

export type WorkspaceProps = {
  readonly camera: CameraSnapshot;
  readonly setCamera: (patch: Partial<CameraSnapshot>) => void;
  readonly panMode?: WorkspacePanMode;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly svgClassName?: string;
  readonly svgStyle?: React.CSSProperties;
  readonly children: (args: WorkspaceChildArgs) => React.ReactNode;
};

export function Workspace(props: WorkspaceProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useCanvasSize(wrapRef);

  // useCanvasInput needs always-fresh access to the live camera; we
  // funnel reads through a ref so the once-bound DOM listeners stay
  // current without re-binding every frame.
  const cameraRef = useRef(props.camera);
  cameraRef.current = props.camera;
  const setCameraRef = useRef(props.setCamera);
  setCameraRef.current = props.setCamera;

  const { spaceDown } = useCanvasInput(wrapRef, {
    pan: props.panMode ?? 'both',
    minZoom: props.minZoom ?? 0.1,
    maxZoom: props.maxZoom ?? 30,
    getCamera: () => cameraRef.current,
    setCamera: (patch) => setCameraRef.current(patch),
  });

  const w = Math.max(size.w, 1);
  const h = Math.max(size.h, 1);

  return (
    <div ref={wrapRef} className={props.className} style={props.style}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className={props.svgClassName}
        style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          ...props.svgStyle,
        }}
      >
        {props.children({ width: w, height: h, spaceDown, svgRef })}
      </svg>
    </div>
  );
}
