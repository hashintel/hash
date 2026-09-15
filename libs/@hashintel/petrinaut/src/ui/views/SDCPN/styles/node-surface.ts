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
  "--node-outline-color": "var(--colors-neutral-s70)",
  _hover: {
    "--node-outline-color": "var(--colors-neutral-s100)",
  },
});
