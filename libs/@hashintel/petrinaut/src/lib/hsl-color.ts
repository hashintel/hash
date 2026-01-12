/* eslint-disable id-length */
/**
 * Utility for creating and manipulating HSL colors.
 *
 * @example
 * ```ts
 * // Create a base color
 * const blue = hsl(210, 80, 50);
 *
 * // Use it directly
 * outline: blue.css(0.6) // "hsla(210, 80%, 50%, 0.6)"
 *
 * // Adjust saturation and lightness
 * outline: blue.saturation(60).lightness(70).css(0.5)
 * ```
 */

export interface HslColor {
  /** Hue (0-360) */
  h: number;
  /** Saturation (0-100) */
  s: number;
  /** Lightness (0-100) */
  l: number;

  /** Returns a new color with adjusted hue */
  hue: (h: number) => HslColor;
  /** Returns a new color with adjusted saturation */
  saturation: (s: number) => HslColor;
  /** Returns a new color with adjusted lightness */
  lightness: (l: number) => HslColor;

  /** Adjust saturation relative to current value */
  saturate: (delta: number) => HslColor;
  /** Adjust lightness relative to current value */
  lighten: (delta: number) => HslColor;

  /** Returns CSS hsla string with optional alpha */
  css: (alpha?: number) => string;
  /** Returns CSS hsl string (no alpha) */
  toString: () => string;
}

/**
 * Create an HSL color that can be easily adjusted.
 *
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 */
export function hsl(h: number, s: number, l: number): HslColor {
  const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, val));

  const color: HslColor = {
    h: clamp(h, 0, 360),
    s: clamp(s, 0, 100),
    l: clamp(l, 0, 100),

    hue: (newH) => hsl(newH, color.s, color.l),
    saturation: (newS) => hsl(color.h, newS, color.l),
    lightness: (newL) => hsl(color.h, color.s, newL),

    saturate: (delta) => hsl(color.h, color.s + delta, color.l),
    lighten: (delta) => hsl(color.h, color.s, color.l + delta),

    css: (alpha = 1) =>
      alpha === 1
        ? `hsl(${color.h}, ${color.s}%, ${color.l}%)`
        : `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha})`,

    toString: () => `hsl(${color.h}, ${color.s}%, ${color.l}%)`,
  };

  return color;
}

/**
 * Convert RGB values to HSL.
 *
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 */
export function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6;
        break;
    }
  }

  return hsl(Math.round(h * 360), Math.round(s * 100), Math.round(l * 100));
}

/**
 * Parse a hex color string to HSL.
 *
 * @param hex - Hex color string (e.g., "#ff5500" or "ff5500")
 */
export function hexToHsl(hex: string): HslColor {
  const cleanHex = hex.replace(/^#/, "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  return rgbToHsl(r, g, b);
}
