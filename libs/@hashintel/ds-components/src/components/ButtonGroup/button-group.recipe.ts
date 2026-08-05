import { cva } from "@hashintel/ds-helpers/css";

// The group is a full-width flex row so that `alignedTo` can push its buttons
// to either edge of the available space. The `segmented` variant overlaps the
// buttons' 1px borders and drops the touching corner radii so a row of buttons
// reads as a single joined control.
export const styles = cva({
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    width: "full",
  },
  variants: {
    variant: {
      spaced: {
        gap: "2",
      },
      segmented: {
        gap: "0",
        "& > *:not(:last-child)": {
          marginRight: "[-1px]",
          borderTopRightRadius: "[0]",
          borderBottomRightRadius: "[0]",
        },
        "& > *:not(:first-child)": {
          borderTopLeftRadius: "[0]",
          borderBottomLeftRadius: "[0]",
        },
        // Solid buttons share an opaque fill, so an overlapping border is
        // invisible between two of them — swap the -1px overlap for a thin gap
        // so adjacent solids stay visually distinct.
        "& > [data-variant='solid']:has(+ [data-variant='solid'])": {
          marginRight: "[2px]",
        },
        // Raise the hovered/focused button so its full border and focus ring
        // draw over the neighbour whose border it overlaps.
        "& > *:hover, & > *:focus-visible": {
          zIndex: "[1]",
        },
      },
    },
    alignedTo: {
      left: { justifyContent: "flex-start" },
      right: { justifyContent: "flex-end" },
    },
  },
  defaultVariants: {
    variant: "spaced",
    alignedTo: "left",
  },
});
