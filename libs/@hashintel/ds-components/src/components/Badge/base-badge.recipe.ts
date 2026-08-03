import { css, cva } from "@hashintel/ds-helpers/css";

export const baseBadgeWrapper = css({
  position: "relative",
  display: "inline-flex",
});

export const baseBadgeFrame = css({
  position: "absolute",
  inset: "0",
  containerType: "inline-size",
  pointerEvents: "none",
});

// Positions the overlay (`content`) on a corner of the anchor.
// The overlay is anchored by its left edge (left: 0) and shifted by a transform
// mixing `cqw` (a share of the anchor's width) with `%` (a share of the
// overlay's own width). For a right corner the inner (left) edge sits at
// `max(100cqw - 50%, 50cqw)`: the corner-centred position (anchor width minus
// half the overlay), floored at the 50cqw midline. Left corners mirror this.
export const baseBadgePosition = cva({
  base: {
    position: "absolute",
    display: "inline-flex",
    left: "0",
    "--align-inset": "0cqw",
  },
  variants: {
    position: {
      "top-left": {
        top: "0",
        transform:
          "[translate(min(-50%, 50cqw - 100%), -50%) translate(var(--align-inset), var(--align-inset))]",
      },
      "top-right": {
        top: "0",
        transform:
          "[translate(max(100cqw - 50%, 50cqw), -50%) translate(calc(-1 * var(--align-inset)), var(--align-inset))]",
      },
      "bottom-left": {
        bottom: "0",
        transform:
          "[translate(min(-50%, 50cqw - 100%), 50%) translate(var(--align-inset), calc(-1 * var(--align-inset)))]",
      },
      "bottom-right": {
        bottom: "0",
        transform:
          "[translate(max(100cqw - 50%, 50cqw), 50%) translate(calc(-1 * var(--align-inset)), calc(-1 * var(--align-inset)))]",
      },
    },
    // Align to a circular anchor. Start from the circle's 45° edge point —
    // inset (1 - cos45°) · radius = (1 - cos45°) · 50cqw ≈ 14.6cqw from each edge
    // (using width for both axes, i.e. assuming a square/circular anchor) — then
    // nudge the badge back outward along the diagonal by 1/6 of its own size
    // (cos45° / 6 ≈ 11.8% per axis, resolving against the badge's own width/
    // height) so ~1/3 of it overlaps the circle and 2/3 sits outside, rather
    // than being split evenly across the edge.
    alignTo: {
      circle: {
        "--align-inset": "calc((1 - 0.70711) * 50cqw - (0.70711 / 6) * 100%)",
      },
    },
  },
  defaultVariants: {
    position: "top-right",
  },
});
