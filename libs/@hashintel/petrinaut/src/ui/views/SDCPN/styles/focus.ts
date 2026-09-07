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

import type { CanvasArcFocus } from "../canvas-focus";

/**
 * How long the pointer has to rest before the neighbourhood lights up.
 * Sweeping across the canvas passes over nodes without any of them flashing.
 */
export const HOVER_FOCUS_DELAY_MS = 150;

const FOCUSED_COLOR = "var(--colors-neutral-s100)";
const UPSTREAM_COLOR = "var(--colors-blue-s90)";
const DOWNSTREAM_COLOR = "var(--colors-orange-s90)";

/**
 * The focus ring for a canvas node, keyed by its focus role. Every node style
 * composes this, and it is the only place a node's outline is set: two styles
 * setting `outline` would resolve by stylesheet order rather than intent.
 *
 * The ring fades over 200ms, so a neighbourhood arrives and leaves as a fade
 * rather than a switch.
 */
export const nodeFocusStyle = cva({
  base: {
    outline: "[4px solid transparent]",
    transition:
      "[outline-color 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease]",
  },
  variants: {
    focus: {
      none: {},
      focused: {
        outline:
          "[4px solid color-mix(in oklab, var(--colors-neutral-s100), transparent 55%)]",
      },
      upstream: {
        outline:
          "[4px solid color-mix(in oklab, var(--colors-blue-s90), transparent 55%)]",
      },
      downstream: {
        outline:
          "[4px solid color-mix(in oklab, var(--colors-orange-s90), transparent 55%)]",
      },
      bidirectional: {
        outline:
          "[4px solid color-mix(in oklab, var(--colors-purple-s90), transparent 55%)]",
      },
      /**
       * Only the border and the label recede, and only by one step — a node
       * keeps its fill, its shape and a readable label, so the rest of the net
       * can still be read while a neighbourhood is highlighted.
       */
      muted: { borderColor: "neutral.s70", color: "neutral.s110" },
    },
  },
  defaultVariants: { focus: "none" },
});

/**
 * An arc's stroke and arrowhead colour for its focus role. Arcs away from the
 * neighbourhood keep their token type's colour, only lighter.
 */
export const arcFocusColor = (focus: CanvasArcFocus, color: string): string => {
  switch (focus) {
    case "focused":
      return FOCUSED_COLOR;
    case "incoming":
      return UPSTREAM_COLOR;
    case "outgoing":
      return DOWNSTREAM_COLOR;
    case "muted":
      return `color-mix(in oklab, white 35%, ${color})`;
    case "none":
      return color;
  }
};
