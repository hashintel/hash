import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["section"],
  base: {
    section: {
      // tracks and gap mirror inlineControl's; inline fields subgrid onto
      // them so labels and inputs align across adjacent fields. Three tracks:
      // left labels, inputs, right labels (labelDirection="right") — a side
      // with no labels stays empty and collapses to zero width
      display: "grid",
      gridTemplateColumns: "[auto minmax(0, 1fr) auto]",
      columnGap: "5",

      "& > *": {
        gridColumn: "[1 / -1]",
      },

      // spacing between adjacent form fields only — custom elements manage
      // their own vertical spacing (rowGap can't be used: it would also
      // separate an inline field's own description/errors rows). Inline
      // fields render no box (display: contents), so the margin goes on
      // their first rendered part instead.
      '& > [data-part="form-field"] + [data-part="form-field"]': {
        marginTop: "5",
      },
      '& > [data-part="form-field"] + [data-layout="inline"] > *:first-child': {
        marginTop: "5",
      },
    },
  },
});
