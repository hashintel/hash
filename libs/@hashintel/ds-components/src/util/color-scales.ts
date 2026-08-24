// colorjs.io is a devDependency; these scales are used by tooling/stories, not
// imported by the shipped components, so they don't add a runtime dependency.
import Color from "colorjs.io";

/**
 * The "Brandmark" categorical colour scale, built with colorjs.
 *
 * {@link brandmarkScale} is a `(count) => string[]` generator: the HASH design-
 * system accent colours, nudged a touch more vivid, extended with brand-envelope
 * hues past the seven anchors. Its parameters mirror the "Brandmark" palette-
 * explorer preset, so it produces the same colours outside the explorer.
 */

/**
 * Serialise to a full `#RRGGBB` hex. colorjs collapses `#ffffff` to `#fff`, so
 * collapsing is disabled; out-of-gamut OKLCH colours are clipped into sRGB first.
 */
const toHex = (color: Color): string =>
  color
    .to("srgb")
    .toGamut({ space: "srgb", method: "clip" })
    .toString({ format: "hex", collapse: false });

// The accent hues (the `s90` "solid" step of each design-system palette), used
// verbatim for the first seven colours, ordered so consecutive colours contrast.
const BRAND_HEXES = [
  "#0090ff", // blue
  "#f76b15", // orange
  "#30a46c", // green
  "#d6409f", // pink
  "#8e4ec6", // purple
  "#e5484d", // red
  "#ffe629", // yellow
];
// The OKLCH hue of each accent above, in the same order — the seeds the
// gap-filling extension grows from beyond the seven anchors.
const BRAND_HUES = [251.8, 45, 157.7, 346, 305.9, 23, 100.9];
// The lightness/chroma envelope shared by the accents (bar the outlier yellow),
// used to render any extra hues alongside them.
const BRAND_EXTEND_LIGHTNESS = 0.66;
const BRAND_EXTEND_CHROMA = 0.16;
// Brandmark scales chroma up a touch so the accents read a hair more vivid.
const BRANDMARK_CHROMA_SCALE = 1.08;

/** Scale a colour's OKLCH chroma while keeping its lightness and hue. */
const scaleChroma = (hex: string, chromaScale: number): string => {
  const oklch = new Color(hex).to("oklch");
  return toHex(
    new Color("oklch", [
      oklch.l,
      // `.c` is null for a fully achromatic colour; the brand hexes aren't, but guard.
      Math.max(0, (oklch.c ?? 0) * chromaScale),
      // `.h` is NaN for a fully achromatic colour; the brand hues aren't, but guard.
      Number.isNaN(oklch.h) ? 0 : oklch.h,
    ]),
  );
};

/**
 * Extend `seedHues` (degrees) to `total` hues by repeatedly splitting the widest
 * gap on the colour wheel, so each hue added past the seeds sits as far as
 * possible from every hue already chosen.
 */
const fillHueGaps = (seedHues: number[], total: number): number[] => {
  const hues = [...seedHues];
  while (hues.length < total) {
    const sorted = [...hues].sort((first, second) => first - second);
    let widestMid = 0;
    let widestGap = -1;
    for (let index = 0; index < sorted.length; index += 1) {
      const low = sorted[index] ?? 0;
      // Wrap the final gap back round to the first hue past 360°.
      const high =
        index + 1 < sorted.length
          ? (sorted[index + 1] ?? 0)
          : (sorted[0] ?? 0) + 360;
      const gap = high - low;
      if (gap > widestGap) {
        widestGap = gap;
        widestMid = ((low + high) / 2) % 360;
      }
    }
    hues.push(widestMid);
  }
  return hues;
};

/**
 * Build the Brandmark scale: the design-system accents (a hair more vivid) for the
 * first seven colours, extended with brand-envelope hues placed in the widest hue
 * gaps for anything beyond that.
 */
export const brandmarkScale = (count: number): string[] => {
  if (count <= BRAND_HEXES.length) {
    return BRAND_HEXES.slice(0, count).map((hex) =>
      scaleChroma(hex, BRANDMARK_CHROMA_SCALE),
    );
  }
  return fillHueGaps(BRAND_HUES, count).map((hue, index) =>
    index < BRAND_HEXES.length
      ? scaleChroma(BRAND_HEXES[index] ?? "#000000", BRANDMARK_CHROMA_SCALE)
      : toHex(
          new Color("oklch", [
            BRAND_EXTEND_LIGHTNESS,
            BRAND_EXTEND_CHROMA * BRANDMARK_CHROMA_SCALE,
            hue,
          ]),
        ),
  );
};
