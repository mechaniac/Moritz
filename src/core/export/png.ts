/**
 * Rasterize an SVG string to a PNG data URL with transparency.
 *
 * This is the only place in the codebase that touches the DOM for export.
 * Pure-`core` code never imports this; it lives under `core/export/` because
 * it is the canonical PNG path, but it requires a browser environment.
 */

export type RasterizeOptions = {
  /** Pixels per font-unit. Combined with the SVG's intrinsic size. */
  readonly pixelsPerUnit?: number;
  /** Override pixel width (otherwise derived from SVG width attr). */
  readonly width?: number;
  /** Override pixel height. */
  readonly height?: number;
};

/** Returns a PNG data URL. */
export async function svgToPng(
  svg: string,
  opts: RasterizeOptions = {},
): Promise<string> {
  const { width: w, height: h } = parseSvgSize(svg);
  const pxScale = opts.pixelsPerUnit ?? 2;
  const pxW = opts.width ?? Math.max(1, Math.round(w * pxScale));
  const pxH = opts.height ?? Math.max(1, Math.round(h * pxScale));

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.src = src;
  });
}

function parseSvgSize(svg: string): { width: number; height: number } {
  const w = /\bwidth="([\d.]+)"/.exec(svg)?.[1];
  const h = /\bheight="([\d.]+)"/.exec(svg)?.[1];
  return {
    width: w ? parseFloat(w) : 800,
    height: h ? parseFloat(h) : 600,
  };
}
