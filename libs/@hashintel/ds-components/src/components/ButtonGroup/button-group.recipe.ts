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
        // A Button with a `tooltip` wraps its control in a trigger span, so the
        // group's direct child may be that wrapper while the bordered control
        // (which carries `data-variant` and the render-applied `data-row-*`) is
        // nested. So: square the *control* by descendant selector, but overlap
        // the *flex item* (peeking at the control with `:has`). `data-row-*`
        // mark the first/last control of each visual row.

        // Square the interior corners of the control, keeping the outer radius
        // on each row's first/last.
        "& [data-variant]:not([data-row-start])": {
          borderTopLeftRadius: "[0]",
          borderBottomLeftRadius: "[0]",
        },
        "& [data-variant]:not([data-row-end])": {
          borderTopRightRadius: "[0]",
          borderBottomRightRadius: "[0]",
        },
        "& > *:not([data-row-end]):not(:has([data-row-end]))": {
          marginRight: "[-1px]",
        },
        // Solid buttons share an opaque fill, so add a 2px thin gap (+1px from above)
        // Skipped at a row end, where the next solid sits on the following line.
        "& > :is([data-variant='solid'], :has([data-variant='solid'])) + :is([data-variant='solid'], :has([data-variant='solid'])):not([data-row-start]):not(:has([data-row-start]))":
          {
            marginLeft: "[3px]",
          },
        "& > *:hover, & > *:focus-visible, & > *:has(:focus-visible)": {
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
