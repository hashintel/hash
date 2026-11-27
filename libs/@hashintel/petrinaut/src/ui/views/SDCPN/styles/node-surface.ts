import { css, cx } from "@hashintel/ds-helpers/css";

/**
 * The box of a classic node. Its fill is `--node-fill`, which a place sets
 * from its token type and a transition from its surface.
 */
export const nodeSurfaceStyle = cx(
  "node-surface",
  css({
    width: "full",
    height: "full",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    backgroundColor: "[var(--node-fill)]",
  }),
);

/**
 * A transition's colours. Places take theirs from their token type; a
 * transition carries none, so its surface names them here.
 */
export const transitionSurfaceStyle = css({
  "--node-fill": "var(--colors-neutral-s00)",
  "--node-outline-color": "var(--colors-neutral-s70)",
  _hover: {
    "--node-outline-color": "var(--colors-neutral-s100)",
  },
});
