import { css } from "@hashintel/ds-helpers/css";

/** Half a pixel heavier than the compact card's hairline. */
const OUTLINE_WIDTH = "1.5px";

/**
 * The classic node is outlined by a ring rather than a border: a browser
 * floors a 1.5px border to a whole pixel, while a shadow's spread is painted
 * as given. `--node-outline-color` carries the colour, which a place takes
 * from its token type, and `--node-outline-ring` the shadow that draws it,
 * which the firing flash reuses so a transition keeps its outline while it
 * glows. Only a classic node sets the ring, so a compact card's flash draws
 * none.
 */
export const classicNodeBoxStyle = css({
  // currentColor inside color-mix can become transparent during shadow interpolation.
  "--node-outline-ring": `0 0 0 ${OUTLINE_WIDTH} color-mix(in oklab, var(--node-outline-color, var(--colors-neutral-s120)) 75%, var(--colors-neutral-s70))`,
  "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
  _hover: {
    "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)",
  },
});

export const classicNodeRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  lineHeight: "[1]",
});

export const classicNodeLabelStyle = css({
  fontSize: "[13px]",
  fontWeight: "medium",
  maxWidth: "[100%]",
  overflowWrap: "break-word",
  textOverflow: "ellipsis",
  overflow: "hidden",
  lineHeight: "[1.2]",
});
