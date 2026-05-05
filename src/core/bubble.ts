/**
 * Pure helpers that produce SVG path `d` strings for the four bubble shapes
 * supported by the TypeSetter:
 *
 *   - 'none'   — no bubble (returns '')
 *   - 'rect'   — rounded rectangle (caption box)
 *   - 'speech' — rounded rectangle with a triangular tail
 *   - 'cloud'  — thought-bubble silhouette (rounded scallops) + 2 satellite dots
 *
 * All shapes are drawn in local block space: (0,0) is the top-left of the
 * bubble's bounding box, with size `w × h`. The tail target (for 'speech' and
 * 'cloud') is given in the same local space.
 */

export type BubbleShape = 'none' | 'rect' | 'speech' | 'cloud';

export type BubbleGeometry = {
  /** Main bubble path (filled + stroked). */
  readonly main: string;
  /** Extra paths drawn separately (e.g. cloud satellite dots). Each is a closed sub-path. */
  readonly extras: readonly string[];
};

const fmt = (n: number): string => Number(n.toFixed(2)).toString();

/** Build the geometry for a bubble. `tail` is in local bubble space. */
export function bubbleGeometry(
  shape: BubbleShape,
  w: number,
  h: number,
  tail: { x: number; y: number } = { x: w * 0.2, y: h + h * 0.4 },
): BubbleGeometry {
  switch (shape) {
    case 'none':
      return { main: '', extras: [] };
    case 'rect':
      return { main: roundedRectPath(0, 0, w, h, Math.min(w, h) * 0.08), extras: [] };
    case 'speech':
      return { main: speechBubblePath(w, h, tail), extras: [] };
    case 'cloud':
      return cloudBubble(w, h, tail);
    default:
      return { main: '', extras: [] };
  }
}

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${fmt(x + rr)} ${fmt(y)}`,
    `H ${fmt(x + w - rr)}`,
    `A ${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(x + w)} ${fmt(y + rr)}`,
    `V ${fmt(y + h - rr)}`,
    `A ${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(x + w - rr)} ${fmt(y + h)}`,
    `H ${fmt(x + rr)}`,
    `A ${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(x)} ${fmt(y + h - rr)}`,
    `V ${fmt(y + rr)}`,
    `A ${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(x + rr)} ${fmt(y)}`,
    `Z`,
  ].join(' ');
}

/**
 * Speech bubble: rounded rect with a triangular tail attached at the closest
 * edge to the tail point. Tail base is a small notch on the bubble outline.
 */
function speechBubblePath(
  w: number,
  h: number,
  tail: { x: number; y: number },
): string {
  const r = Math.min(w, h) * 0.12;

  // Decide which edge the tail attaches to: the side facing the tail tip.
  const cx = w / 2;
  const cy = h / 2;
  const dx = tail.x - cx;
  const dy = tail.y - cy;
  const onBottom = dy > 0 && Math.abs(dy) * w >= Math.abs(dx) * h ? true : false;
  const onTop = dy < 0 && Math.abs(dy) * w >= Math.abs(dx) * h ? true : false;
  const onRight = !onBottom && !onTop && dx > 0;
  const onLeft = !onBottom && !onTop && dx < 0;

  // Tail base width along the bubble edge.
  const baseHalf = Math.min(w, h) * 0.08;

  const corners = roundedRectCorners(0, 0, w, h, r);

  if (onBottom) {
    // Bottom edge: insert tail between (w-r, h) and (r, h).
    const baseCx = clamp(tail.x, r + baseHalf, w - r - baseHalf);
    return [
      `M ${fmt(r)} 0`,
      `H ${fmt(w - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w)} ${fmt(r)}`,
      `V ${fmt(h - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w - r)} ${fmt(h)}`,
      `L ${fmt(baseCx + baseHalf)} ${fmt(h)}`,
      `L ${fmt(tail.x)} ${fmt(tail.y)}`,
      `L ${fmt(baseCx - baseHalf)} ${fmt(h)}`,
      `H ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(h - r)}`,
      `V ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
      `Z`,
    ].join(' ');
  }
  if (onTop) {
    const baseCx = clamp(tail.x, r + baseHalf, w - r - baseHalf);
    return [
      `M ${fmt(r)} 0`,
      `L ${fmt(baseCx - baseHalf)} 0`,
      `L ${fmt(tail.x)} ${fmt(tail.y)}`,
      `L ${fmt(baseCx + baseHalf)} 0`,
      `H ${fmt(w - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w)} ${fmt(r)}`,
      `V ${fmt(h - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w - r)} ${fmt(h)}`,
      `H ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(h - r)}`,
      `V ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
      `Z`,
    ].join(' ');
  }
  if (onRight) {
    const baseCy = clamp(tail.y, r + baseHalf, h - r - baseHalf);
    return [
      `M ${fmt(r)} 0`,
      `H ${fmt(w - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w)} ${fmt(r)}`,
      `V ${fmt(baseCy - baseHalf)}`,
      `L ${fmt(tail.x)} ${fmt(tail.y)}`,
      `L ${fmt(w)} ${fmt(baseCy + baseHalf)}`,
      `V ${fmt(h - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w - r)} ${fmt(h)}`,
      `H ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(h - r)}`,
      `V ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
      `Z`,
    ].join(' ');
  }
  if (onLeft) {
    const baseCy = clamp(tail.y, r + baseHalf, h - r - baseHalf);
    return [
      `M ${fmt(r)} 0`,
      `H ${fmt(w - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w)} ${fmt(r)}`,
      `V ${fmt(h - r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(w - r)} ${fmt(h)}`,
      `H ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(h - r)}`,
      `V ${fmt(baseCy + baseHalf)}`,
      `L ${fmt(tail.x)} ${fmt(tail.y)}`,
      `L 0 ${fmt(baseCy - baseHalf)}`,
      `V ${fmt(r)}`,
      `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
      `Z`,
    ].join(' ');
  }
  // Fallback: plain rounded rect.
  void corners;
  return roundedRectPath(0, 0, w, h, r);
}

/** Convenience getter for the four corner centers of a rounded rect. */
function roundedRectCorners(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): { tl: { x: number; y: number }; tr: { x: number; y: number }; bl: { x: number; y: number }; br: { x: number; y: number } } {
  return {
    tl: { x: x + r, y: y + r },
    tr: { x: x + w - r, y: y + r },
    bl: { x: x + r, y: y + h - r },
    br: { x: x + w - r, y: y + h - r },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Cloud bubble: an oval-ish silhouette built from a fan of small arcs
 * (scallops) around the bubble's bounding box, plus 2 satellite dots
 * leading toward the tail position.
 */
function cloudBubble(
  w: number,
  h: number,
  tail: { x: number; y: number },
): BubbleGeometry {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;

  // Number of bumps around the perimeter — scale with size for consistency.
  const bumps = Math.max(12, Math.round((w + h) / 35));
  const bumpR = Math.min(w, h) * 0.12; // radius of each bump

  const parts: string[] = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const px = cx + Math.cos(a) * (rx - bumpR * 0.4);
    const py = cy + Math.sin(a) * (ry - bumpR * 0.4);
    if (i === 0) parts.push(`M ${fmt(px - bumpR)} ${fmt(py)}`);
    parts.push(
      `A ${fmt(bumpR)} ${fmt(bumpR)} 0 0 1 ${fmt(px + bumpR)} ${fmt(py)}`,
    );
  }
  parts.push('Z');
  const main = parts.join(' ');

  // Satellite dots from the bubble edge toward the tail position.
  const extras: string[] = [];
  const dx = tail.x - cx;
  const dy = tail.y - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Anchor the chain on the bubble edge in that direction, then march outward.
  const edgeX = cx + ux * rx;
  const edgeY = cy + uy * ry;
  const span = Math.hypot(tail.x - edgeX, tail.y - edgeY);
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    const cxd = edgeX + (tail.x - edgeX) * t;
    const cyd = edgeY + (tail.y - edgeY) * t;
    const dr = Math.max(2, Math.min(w, h) * 0.06 * (1 - t * 0.5));
    extras.push(
      `M ${fmt(cxd - dr)} ${fmt(cyd)} A ${fmt(dr)} ${fmt(dr)} 0 1 0 ${fmt(cxd + dr)} ${fmt(cyd)} A ${fmt(dr)} ${fmt(dr)} 0 1 0 ${fmt(cxd - dr)} ${fmt(cyd)} Z`,
    );
    void span;
  }
  return { main, extras };
}
