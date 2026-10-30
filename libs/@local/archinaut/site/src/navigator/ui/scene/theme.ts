/**
 * The colours and fonts the canvas paints with, read from the page's custom
 * properties so the map follows the theme and the diagrams' palette.
 */

import {
  classFor,
  layerPalette,
} from "../../../../../src/bundle/shared/palette";

export interface Theme {
  background: string;
  text: string;
  muted: string;
  font: string;
  mono: string;
  edges: { imports: string; declared: string; interface: string };
  shadow: string;
  fillOf: (family: string) => string;
  strokeOf: (family: string) => string;
}

const read = (style: CSSStyleDeclaration, name: string, fallback: string) => {
  const value = style.getPropertyValue(name).trim();
  return value === "" ? fallback : value;
};

export const readTheme = (element: HTMLElement): Theme => {
  const style = getComputedStyle(element);
  const families = new Map<string, { fill: string; stroke: string }>();
  const familyOf = (family: string) => {
    const known = families.get(family);
    if (known !== undefined) {
      return known;
    }
    const base = layerPalette[family] ?? { fill: "#f2f2f2", stroke: "#777" };
    const colours =
      family === "interface" || family === "external"
        ? {
            fill: read(style, `--nav-${family}-fill`, base.fill),
            stroke: read(style, `--nav-${family}-stroke`, base.stroke),
          }
        : {
            fill: read(style, `--pnd-diagram-${family}-fill`, base.fill),
            stroke: read(style, `--pnd-diagram-${family}-stroke`, base.stroke),
          };
    families.set(family, colours);
    return colours;
  };
  const font = read(style, "--sl-font", "system-ui, sans-serif");
  return {
    background: read(style, "--nav-bg", "#fff"),
    text: read(style, "--nav-text", "#111"),
    muted: read(style, "--nav-muted", "#777"),
    font,
    mono: read(style, "--sl-font-mono", "ui-monospace, monospace"),
    edges: {
      imports: read(style, "--nav-edge-imports", "#afafaf"),
      declared: read(style, "--nav-edge-declared", "#7c3aed"),
      interface: read(style, "--nav-edge-interface", "#b8862b"),
    },
    shadow: read(style, "--nav-shadow", "rgb(0 0 0 / 0.2)"),
    fillOf: (family) => familyOf(family).fill,
    strokeOf: (family) => familyOf(family).stroke,
  };
};

/** The palette family a node is painted in. */
export const familyOfNode = (
  id: string,
  kind: "layer" | "interface" | "external",
): string => (kind === "layer" ? classFor(id) : kind);
