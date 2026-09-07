/**
 * How the canvas shows what it is focused on.
 *
 * A focused node and its neighbours are ringed in colour — blue for what
 * feeds them, orange for what they feed, purple where a cycle makes a
 * neighbour both — and the rest of the net recedes only as far as a softer
 * border and label. This matches the Notebook's net graph, and it leaves
 * every node's own fill and token count as legible as it was before the
 * pointer arrived.
 *
 * Panda reads the styles below statically, so the ring declarations are
 * spelled out rather than composed from the colour constants.
 */

import { cva } from "@hashintel/ds-helpers/css";

import type { CanvasArcFocus, CanvasNodeFocus } from "../canvas-focus";

/**
 * How long the pointer has to rest before the neighbourhood lights up.
 * Sweeping across the canvas passes over nodes without any of them flashing.
 */
export const HOVER_FOCUS_DELAY_MS = 100;

const FOCUSED_COLOR = "var(--colors-neutral-s115)";
const UPSTREAM_COLOR = "var(--colors-blue-s90)";
const DOWNSTREAM_COLOR = "var(--colors-orange-s90)";
const BIDIRECTIONAL_COLOR = "var(--colors-purple-s90)";

/**
 * The focus ring for a canvas node, keyed by its focus role. Every node style
 * composes this, and it is the only place a node's outline and box shadow are
 * set: two styles setting either would resolve by stylesheet order rather than
 * intent. A node style contributes its own elevation through
 * `--node-elevation` instead of declaring a shadow of its own.
 *
 * A highlighted node wears two bands outside its own border: white first,
 * lifting the node off the dotted canvas, then the role's colour. Both are
 * anchored on the border box, so they stay concentric whatever the node's
 * shape. They fade over 200ms, so a neighbourhood arrives and leaves as a fade
 * rather than a switch.
 */
export const nodeFocusStyle = cva({
  base: {
    outline: "[4px solid transparent]",
    outlineOffset: "[3px]",
    boxShadow:
      "[var(--focus-glow, 0 0 #0000), var(--node-elevation, 0 0 #0000)]",
    transition:
      "[outline-color 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease]",
  },
  variants: {
    focus: {
      none: {},
      focused: {
        "--focus-glow": "0 0 0 3px white",
        outline:
          "[4px solid color-mix(in oklab, var(--colors-neutral-s115), transparent 25%)]",
      },
      upstream: {
        "--focus-glow": "0 0 0 3px white",
        outline:
          "[4px solid color-mix(in oklab, var(--colors-blue-s90), transparent 25%)]",
      },
      downstream: {
        "--focus-glow": "0 0 0 3px white",
        outline:
          "[4px solid color-mix(in oklab, var(--colors-orange-s90), transparent 25%)]",
      },
      bidirectional: {
        "--focus-glow": "0 0 0 3px white",
        outline:
          "[4px solid color-mix(in oklab, var(--colors-purple-s90), transparent 25%)]",
      },
      /**
       * Border and label recede, the fill and the token count do not: the rest
       * of the net stays readable, and stays put, while a neighbourhood is
       * highlighted.
       */
      muted: { borderColor: "neutral.s45", color: "neutral.s90" },
    },
  },
  defaultVariants: { focus: "none" },
});

/**
 * An arc's own stroke and arrowhead colour. An arc in the neighbourhood keeps
 * its token type's colour and takes the role's colour as a casing around it,
 * the way a node keeps its border inside its ring. Arcs away from the
 * neighbourhood keep that colour too, only lighter.
 */
export const arcFocusColor = (focus: CanvasArcFocus, color: string): string =>
  focus === "muted" ? `color-mix(in oklab, white 60%, ${color})` : color;

/**
 * The colour of the casing drawn around an arc's stroke, or undefined for an
 * arc that gets none. Only arcs at the focused item are cased, so the extra
 * paths track the neighbourhood rather than the net.
 */
export const arcHaloColor = (focus: CanvasArcFocus): string | undefined => {
  switch (focus) {
    case "focused":
      return FOCUSED_COLOR;
    case "incoming":
      return UPSTREAM_COLOR;
    case "outgoing":
      return DOWNSTREAM_COLOR;
    case "muted":
    case "none":
      return undefined;
  }
};

/**
 * How far each casing stands out either side of the arc it wraps: white first,
 * lifting the arc off the canvas, then the role's colour around that. The two
 * match the bands a highlighted node wears outside its border.
 */
export const ARC_WHITE_OVERHANG = 2;
export const ARC_HALO_OVERHANG = ARC_WHITE_OVERHANG + 2;

/** How far a shape off the neighbourhood recedes on the minimap. */
export const MINI_MAP_MUTED_OPACITY = 0.3;

/**
 * The ring colour for a shape on the minimap, or undefined for a shape that
 * gets none. The minimap has room for a ring and a fade, not for the canvas's
 * white band, so the roles reach it through colour alone.
 */
export const miniMapFocusColor = (
  focus: CanvasNodeFocus,
): string | undefined => {
  switch (focus) {
    case "focused":
      return FOCUSED_COLOR;
    case "upstream":
      return UPSTREAM_COLOR;
    case "downstream":
      return DOWNSTREAM_COLOR;
    case "bidirectional":
      return BIDIRECTIONAL_COLOR;
    case "muted":
    case "none":
      return undefined;
  }
};
