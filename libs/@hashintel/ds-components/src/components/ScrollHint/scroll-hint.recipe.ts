import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    position: "relative",
    minHeight: "0",
    minWidth: "0",
  },
  variants: {
    // Enable scrolling on each axis independently. The `mask-image` that fades
    // scrollable edges is computed from runtime scroll state and so is applied
    // as an inline style by the component rather than here.
    vertical: {
      true: { overflowY: "auto" },
    },
    horizontal: {
      true: { overflowX: "auto" },
    },
    // When any edge is fading, the vertical and horizontal mask layers are
    // intersected so corners fade correctly when both axes overflow.
    hasFade: {
      true: {
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      },
    },
  },
});
