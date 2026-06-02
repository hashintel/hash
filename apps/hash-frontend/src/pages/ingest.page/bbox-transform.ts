/**
 * Coordinate transform: PDF-point bbox → CSS percentage positioning.
 *
 * Overlays are absolutely-positioned <div>s inside a container wrapping the
 * page <img>. Percentage-based positioning keeps them responsive.
 */

export interface BboxInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BboxPercentage {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function bboxToPercentage(
  bbox: BboxInput,
  pdfPageWidth: number,
  pdfPageHeight: number,
  origin: "BOTTOMLEFT" | "TOPLEFT",
): BboxPercentage {
  const left = (bbox.x1 / pdfPageWidth) * 100;
  const width = ((bbox.x2 - bbox.x1) / pdfPageWidth) * 100;
  const height = ((bbox.y2 - bbox.y1) / pdfPageHeight) * 100;

  const top =
    origin === "BOTTOMLEFT"
      ? ((pdfPageHeight - bbox.y2) / pdfPageHeight) * 100
      : (bbox.y1 / pdfPageHeight) * 100;

  return { left, top, width, height };
}
