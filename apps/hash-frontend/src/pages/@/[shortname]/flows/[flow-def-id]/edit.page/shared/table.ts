import { css } from "@hashintel/ds-helpers/css";

/** A table in the flows editor, e.g. of runs or of a run's entities. */
export const tableStyle = css({
  width: "full",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    height: "8",
    px: "4",
    textAlign: "left",
    textStyle: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    whiteSpace: "nowrap",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& td": {
    height: "12",
    px: "4",
    color: "fg.body",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& [data-align=right]": { textAlign: "right" },
});
