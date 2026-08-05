import { cva } from "@hashintel/ds-helpers/css";

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
        // Solid buttons share an opaque fill, so swap the -1px overlap for a thin gap
        // Skipped at a row end, where the next solid sits on the following line.
        "& > [data-variant='solid']:not([data-row-end]):has(+ [data-variant='solid'])":
          {
            marginRight: "[2px]",
          },
        "& > *:hover, & > *:focus-visible": {
          zIndex: "[1]",
        },
      },
    },
    alignedTo: {
      left: { justifyContent: "flex-start" },
      right: { justifyContent: "flex-end" },
    },
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
