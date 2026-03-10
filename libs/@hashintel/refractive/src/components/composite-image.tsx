import type { ImageData } from "canvas";

import type { Parts } from "../helpers/split-imagedata-to-parts";
import { splitImageDataToParts } from "../helpers/split-imagedata-to-parts";

type CompositeImageProps = {
  imageData: ImageData;
  cornerWidth: number;
  pixelRatio: number;
  result: string;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * Builds an SVG string containing all 9 image parts composited together,
 * then returns it as a base64 data URL.
 *
 * The SVG has no viewBox and no explicit dimensions, so it adapts to whatever
 * size the feImage renders it at. Corners are placed at fixed pixel sizes using
 * nested SVGs with overflow="visible" and percentage-based positioning.
 */
function buildCompositeSvgUrl(
  parts: Parts,
  cornerWidth: number,
  hideTop?: boolean,
  hideBottom?: boolean,
  hideLeft?: boolean,
  hideRight?: boolean,
): string {
  const cw = cornerWidth;
  const elements: string[] = [];

  // Center (base layer, stretched to fill)
  elements.push(
    `<image href="${parts.center}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"/>`,
  );

  // Edges
  if (!hideTop) {
    elements.push(
      `<image href="${parts.top}" x="0" y="0" width="100%" height="${cw}" preserveAspectRatio="none"/>`,
    );
  }
  if (!hideLeft) {
    elements.push(
      `<image href="${parts.left}" x="0" y="0" width="${cw}" height="100%" preserveAspectRatio="none"/>`,
    );
  }
  if (!hideRight) {
    elements.push(
      `<svg x="100%" y="0" width="0" height="100%" overflow="visible">` +
        `<image href="${parts.right}" x="${-cw}" y="0" width="${cw}" height="100%" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
  }
  if (!hideBottom) {
    elements.push(
      `<svg x="0" y="100%" width="100%" height="0" overflow="visible">` +
        `<image href="${parts.bottom}" x="0" y="${-cw}" width="100%" height="${cw}" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
  }

  // Corners
  if (!hideTop && !hideLeft) {
    elements.push(
      `<image href="${parts.topLeft}" x="0" y="0" width="${cw}" height="${cw}" preserveAspectRatio="none"/>`,
    );
  }
  if (!hideTop && !hideRight) {
    elements.push(
      `<svg x="100%" y="0" width="0" height="0" overflow="visible">` +
        `<image href="${parts.topRight}" x="${-cw}" y="0" width="${cw}" height="${cw}" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
  }
  if (!hideBottom && !hideLeft) {
    elements.push(
      `<svg x="0" y="100%" width="0" height="0" overflow="visible">` +
        `<image href="${parts.bottomLeft}" x="0" y="${-cw}" width="${cw}" height="${cw}" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
  }
  if (!hideBottom && !hideRight) {
    elements.push(
      `<svg x="100%" y="100%" width="0" height="0" overflow="visible">` +
        `<image href="${parts.bottomRight}" x="${-cw}" y="${-cw}" width="${cw}" height="${cw}" preserveAspectRatio="none"/>` +
        `</svg>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${elements.join("")}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * @private
 * Component that builds a composite SVG from 9 image parts and returns a single feImage.
 *
 * Unlike CompositeParts which uses 9 feImage + 8 feComposite filter primitives and requires
 * explicit width/height, this component generates a single SVG data URL that adapts to
 * whatever size the feImage renders it at. Corners have fixed pixel sizes and are positioned
 * via percentage-based nested SVGs with overflow="visible".
 *
 * Used internally by the FilterOBB component, for DisplacementMap and SpecularMap.
 *
 * @return {JSX.Element} A single feImage element referencing the composite SVG data URL.
 */
export const CompositeImage: React.FC<CompositeImageProps> = ({
  imageData,
  cornerWidth,
  pixelRatio,
  result,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  const parts = splitImageDataToParts({
    imageData,
    cornerWidth,
    pixelRatio,
  });

  const svgUrl = buildCompositeSvgUrl(
    parts,
    cornerWidth,
    hideTop,
    hideBottom,
    hideLeft,
    hideRight,
  );

  return <feImage href={svgUrl} result={result} preserveAspectRatio="none" />;
};
