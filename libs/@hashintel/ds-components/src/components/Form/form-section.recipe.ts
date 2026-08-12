import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["section"],
  base: {
    section: {
      // tracks and gap mirror inlineControl's; inline fields subgrid onto them
      // so labels and inputs align across adjacent fields
      display: "grid",
      gridTemplateColumns: "[auto minmax(0, 1fr)]",
      columnGap: "5",

      "& > *": {
        gridColumn: "[1 / -1]",
      },

      // spacing between adjacent form fields only — custom elements manage
      // their own vertical spacing (rowGap can't be used: it would also
      // separate an inline field's own description/errors rows). Inline
      // fields render no box (display: contents), so the margin goes on
      // their first rendered part instead — skipping the visually hidden
      // <legend> an inline as="legend" field starts with.
      '& > [data-part="form-field"] + [data-part="form-field"]': {
        marginTop: "5",
      },
      '& > [data-part="form-field"] + [data-layout="inline"] > *:first-child:not(legend)':
        {
          marginTop: "5",
        },
      '& > [data-part="form-field"] + [data-layout="inline"] > legend + *': {
        marginTop: "5",
      },
    },
  },
});
