/**
 * figma-ds table (`42313:42286`), its header and cells. The header row is 32 px on the subtle fill, 12 px medium
 * body grey; a row is 48 px; cells are 12 px in from each side, the first column 24 px; every row ends in a 1 px
 * s30 divider. The first column reads 14 px medium in the heading colour, the rest 14 px regular in the body grey.
 *
 * Not built here: the part's toolbar (search, Sort, Filter, Display) and its pager. Each page keeps its own (ledger
 * L320 for Logs), and the row hover is ours (11 Nov convergence A8): the figma-ds table has no hover state.
 */
import { css, cx } from "@hashintel/ds-helpers/css";

export const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    height: "[32px]",
    paddingX: "3",
    textAlign: "left",
    textStyle: "xs",
    lineHeight: "[12px]",
    fontWeight: "medium",
    color: "neutral.fg.body",
    whiteSpace: "nowrap",
    backgroundColor: "neutral.bg.subtle.hover",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.s30",
  },
  "& td": {
    height: "[48px]",
    paddingX: "3",
    color: "neutral.fg.body",
    whiteSpace: "nowrap",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.s30",
  },
  "& th:first-child, & td:first-child": { paddingLeft: "6" },
  "& td:first-child": { fontWeight: "medium", color: "neutral.fg.heading" },
});

export const Table = ({
  className,
  ref,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement> & {
  ref?: React.Ref<HTMLTableElement>;
}) => <table ref={ref} className={cx(tableStyle, className)} {...rest} />;
