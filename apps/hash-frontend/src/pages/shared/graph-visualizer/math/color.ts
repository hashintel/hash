/* eslint-disable id-length */
/** Color space conversions. */

// OKLab conversion coefficients from the OKLab spec (Bjorn Ottosson).

/** sRGB gamma encoding (linear to sRGB transfer function). */
function gammaEncode(linear: number): number {
  if (linear >= 0.0031308) {
    return 1.055 * linear ** (1 / 2.4) - 0.055;
  }
  return 12.92 * linear;
}

function clampByte(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

/**
 * Convert an OKLCH color to sRGB.
 *
 * `lightness` in [0, 1], `chroma` in [0, ~0.4] (sRGB gamut), `hue` in
 * [0, 360). Returns [r, g, b] each in [0, 255], clamped to sRGB.
 *
 * Steps: OKLCH -> OKLab (polar to cartesian) -> LMS (cube roots) -> linear sRGB
 * (OKLab spec coefficients) -> gamma-encoded, clamped sRGB bytes.
 */
export function oklchToRgb(
  lightness: number,
  chroma: number,
  hue: number,
): [number, number, number] {
  const hRad = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hRad);
  const b = chroma * Math.sin(hRad);

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [
    clampByte(gammaEncode(rLin)),
    clampByte(gammaEncode(gLin)),
    clampByte(gammaEncode(bLin)),
  ];
}

/** HSL to sRGB. `hue` in [0, 360), `saturation` and `lightness` in [0, 1]. */
export function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sextant = hue / 60;
  const second = chroma * (1 - Math.abs((sextant % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (sextant < 1) {
    red = chroma;
    green = second;
  } else if (sextant < 2) {
    red = second;
    green = chroma;
  } else if (sextant < 3) {
    green = chroma;
    blue = second;
  } else if (sextant < 4) {
    green = second;
    blue = chroma;
  } else if (sextant < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }

  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255),
  ];
}
