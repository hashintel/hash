import { css } from "@hashintel/ds-helpers/css";

export const nodeSurfaceStyle = css({
  width: "full",
  height: "full",
  boxSizing: "border-box",
  position: "relative",
  cursor: "default",
});

/**
 * A transition's colours. Places take theirs from their token type; a
 * transition carries none, so its surface names them here.
 */
export const transitionSurfaceStyle = css({
  background: "neutral.s00",
  // The compact card outlines itself with a border, the classic node with a
  // ring; each mode reads the one that applies to it.
  borderColor: "neutral.s70",
  "--node-outline-color": "var(--colors-neutral-s70)",
  _hover: {
    borderColor: "neutral.s100",
    "--node-outline-color": "var(--colors-neutral-s100)",
  },
});
