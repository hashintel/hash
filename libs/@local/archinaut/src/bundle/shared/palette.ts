/**
 * The colours of the diagrams, in one place because two things read them:
 * the `classes` block the D2 sources carry, which is what d2 renders with,
 * and the stylesheet appended to every rendered SVG, which restates each
 * colour as a custom property so a host can retheme a diagram. Split across
 * two declarations they would drift, and the drift would only show in dark
 * mode.
 */

export const rootSegment = (id: string): string => id.split(".")[0] ?? id;

/**
 * Fill and stroke per layer family, in one place because two things read it:
 * the `classes` block below, which is what `d2` renders with, and the
 * stylesheet appended to every rendered SVG, which restates each colour as a
 * custom property so a host can retheme the diagram. Split across two
 * declarations they would drift, and the drift would only show in dark mode.
 */

export const layerPalette: Record<string, { fill: string; stroke: string }> = {
  core: { fill: "#dcecff", stroke: "#3676b8" },
  react: { fill: "#e8e0ff", stroke: "#7051b5" },
  ui: { fill: "#e2f4e8", stroke: "#3d8055" },
  petrinaut: { fill: "#fdeedc", stroke: "#b5762f" },
  website: { fill: "#eef3d9", stroke: "#6f8f2f" },
  other: { fill: "#f2f2f2", stroke: "#777777" },
  elided: { fill: "#ffffff", stroke: "#aaaaaa" },
};

/*
 * Colours the authored diagrams reach for that mean something other than a
 * layer family: the device a batch runs on, a case that falls back. They are
 * not classes, so they never reach the `classes` block, but they do have to be
 * themeable, or a hand-written diagram renders a pale box with pale text on it
 * the moment a host goes dark.
 */

const accentPalette: Record<string, { fill: string; stroke: string }> = {
  device: { fill: "#fff3d6", stroke: "#b8862b" },
  caution: { fill: "#fdeaea", stroke: "#b83636" },
};

/** Everything the appended stylesheet hands to a custom property. */
export const themeableColours = { ...layerPalette, ...accentPalette };

const knownRoots = ["core", "react", "ui", "petrinaut", "website"];

export const classFor = (id: string): string => {
  const root = rootSegment(id);
  return knownRoots.includes(root) ? root : "other";
};
