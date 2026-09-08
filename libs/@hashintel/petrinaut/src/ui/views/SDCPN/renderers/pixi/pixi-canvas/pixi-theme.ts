/**
 * Colours the Pixi renderer draws with, matching the React Flow nodes' Panda
 * styles. Design tokens are read from their CSS variables at mount so the
 * canvas follows the host theme, with the light values as fallbacks.
 */

import { Color } from "pixi.js";

const tokenFallbacks = {
  "neutral.s00": "#ffffff",
  "neutral.s10": "#fcfcfc",
  "neutral.s15": "#fafafa",
  "neutral.s60": "#d9d9d9",
  "neutral.s70": "#cecece",
  "neutral.s80": "#bbbbbb",
  "neutral.s90": "#8d8d8d",
  "neutral.s100": "#838383",
  "neutral.s120": "#202020",
  "blue.s60": "#acd8fc",
  "blue.s110": "#0d74ce",
  "yellow.s60": "#f3d768",
} as const;

type TokenName = keyof typeof tokenFallbacks;

export type PixiTheme = Record<TokenName, number> & {
  /** Resolves a CSS colour, including `var(--…)` references, to a Pixi colour. */
  color: (css: string) => { color: number; alpha: number };
};

const cssVariableName = (token: TokenName) =>
  `--colors-${token.replace(".", "-")}`;

/** The token a `--colors-…` variable stands for, when it is one we know. */
const tokenOfVariable = (name: string): TokenName | null => {
  const match = /^--colors-([a-z]+)-([a-z0-9]+)$/.exec(name);
  const token = match ? `${match[1]}.${match[2]}` : null;
  return token && token in tokenFallbacks ? (token as TokenName) : null;
};

const parseColor = (css: string): { color: number; alpha: number } => {
  const parsed = new Color(css.trim());
  return { color: parsed.toNumber(), alpha: parsed.alpha };
};

const readTheme = (element: Element | null): PixiTheme => {
  const styles = element ? getComputedStyle(element) : null;
  const resolveVariable = (name: string, fallback: string): string => {
    const value = styles?.getPropertyValue(name).trim();
    if (value) return value;
    const token = tokenOfVariable(name);
    return token ? tokenFallbacks[token] : fallback;
  };
  const tokens = Object.fromEntries(
    (Object.keys(tokenFallbacks) as TokenName[]).map((token) => [
      token,
      parseColor(resolveVariable(cssVariableName(token), tokenFallbacks[token]))
        .color,
    ]),
  ) as Record<TokenName, number>;

  return {
    ...tokens,
    color: (css) => {
      const variable = /^var\((--[^,)]+)(?:,\s*([^)]+))?\)$/.exec(css.trim());
      if (variable) {
        const [, name, fallback] = variable;
        return parseColor(resolveVariable(name!, fallback ?? "#000000"));
      }
      return parseColor(css);
    },
  };
};

/**
 * The theme from the token variables Panda emits on the Petrinaut root
 * element (and on dark-mode ancestors), read once when the renderer mounts.
 * Without a root element, the light values apply.
 */
export const readPixiTheme = (): PixiTheme =>
  readTheme(
    typeof document === "undefined"
      ? null
      : (document.querySelector(".petrinaut-root") ?? document.documentElement),
  );

// Colours and dimensions the React Flow styles hard-code rather than token.

export const selectionOutline = { color: 0x3bb2f6, alpha: 0.6, width: 4 };
export const hoverOutline = { color: 0x4b7e9c, alpha: 0.2, width: 4 };
export const dimmedAlpha = 0.5;
export const handleColor = 0x6b7280;
export const iconBorder = { color: 0x000000, alpha: 0.06 };
/** Classic place border when the place has no type: black lightened by 35%. */
export const untypedClassicPlaceBorder = 0x595959;
export const tokenBadgeColor = 0x111111;
export const arcSelectionHalo = { color: 0xf97316, alpha: 0.4, width: 8 };
export const weightLabelBorder = 0xdddddd;
export const weightSymbolColor = 0x999999;
export const weightTextColor = 0x333333;
export const gridDotColor = 0x91919a;
export const transitionFlash = { color: 0xffe084, alpha: 0.7 };

/** Red, green and blue of a packed colour, each 0 to 255. */
export const colorChannels = (color: number): [number, number, number] => [
  Math.floor(color / 0x10000) % 0x100,
  Math.floor(color / 0x100) % 0x100,
  color % 0x100,
];

export const packColor = (red: number, green: number, blue: number): number =>
  Math.round(red) * 0x10000 + Math.round(green) * 0x100 + Math.round(blue);

/** The colour `t` of the way from `from` to `to`, per channel. */
export const lerpColor = (from: number, to: number, t: number): number => {
  const [fromRed, fromGreen, fromBlue] = colorChannels(from);
  const [toRed, toGreen, toBlue] = colorChannels(to);
  return packColor(
    fromRed + (toRed - fromRed) * t,
    fromGreen + (toGreen - fromGreen) * t,
    fromBlue + (toBlue - fromBlue) * t,
  );
};
