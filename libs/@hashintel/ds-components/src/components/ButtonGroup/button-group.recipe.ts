import { cva } from "@hashintel/ds-helpers/css";

// The group is a full-width flex row so that `alignedTo` can push its buttons
// to either edge of the available space. The `segmented` variant overlaps the
// buttons' 1px borders and drops the touching corner radii so a row of buttons
// reads as a single joined control.
export const styles = cva({
  base: {
    display: "flex",
    alignItems: "center",
    width: "full",
  },
  variants: {
    variant: {
      spaced: {
        gap: "2",
      },
      segmented: {
        columnGap: "0",
        rowGap: "2",
        // Square only the sides that abut a sibling on the same row. The
        // `:first-child`/`:last-child` checks are the pre-JS baseline for the
        // common single-row case; `data-row-start`/`data-row-end` are set by
        // `useSegmentedRows` on the first/last button of each wrapped row so
        // the outer corners stay rounded there too.
        "& > *:not(:last-child):not([data-row-end])": {
          marginRight: "[-1px]",
          borderTopRightRadius: "[0]",
          borderBottomRightRadius: "[0]",
        },
        "& > *:not(:first-child):not([data-row-start])": {
          borderTopLeftRadius: "[0]",
          borderBottomLeftRadius: "[0]",
        },
        // Solid buttons share an opaque fill, so an overlapping border is
        // invisible between two of them — swap the -1px overlap for a thin gap
        // so adjacent solids on the same row stay visually distinct. Skipped at
        // a row end, where the next solid sits on the following line.
        "& > [data-variant='solid']:not([data-row-end]):has(+ [data-variant='solid'])":
          {
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
    // `flexWrap` lives here (not in `base`) so exactly one value is emitted per
    // instance, avoiding a base-vs-variant conflict on the same property.
    noWrap: {
      true: { flexWrap: "nowrap" },
      false: { flexWrap: "wrap" },
    },
  },
  defaultVariants: {
    variant: "spaced",
    alignedTo: "left",
    noWrap: false,
  },
});
