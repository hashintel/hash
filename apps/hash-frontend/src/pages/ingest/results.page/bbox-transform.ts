/**
 * Coordinate transform: PDF-point bbox → CSS percentage positioning.
 *
 * Overlays are absolutely-positioned <div>s inside a container wrapping the
 * page <img>. Percentage-based positioning keeps them responsive.
 */
import type { PageImageManifest, PdfBbox } from "../shared/types";

export interface BboxPercentage {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const bboxToPercentage = (
  bbox: PdfBbox,
  pdfPageWidth: number,
  pdfPageHeight: number,
  origin: PageImageManifest["bboxOrigin"],
): BboxPercentage => {
  const left = (bbox.x1 / pdfPageWidth) * 100;
  const width = ((bbox.x2 - bbox.x1) / pdfPageWidth) * 100;
  const height = ((bbox.y2 - bbox.y1) / pdfPageHeight) * 100;

  const top =
    origin === "BOTTOMLEFT"
      ? ((pdfPageHeight - bbox.y2) / pdfPageHeight) * 100
      : (bbox.y1 / pdfPageHeight) * 100;

  return { left, top, width, height };
};
