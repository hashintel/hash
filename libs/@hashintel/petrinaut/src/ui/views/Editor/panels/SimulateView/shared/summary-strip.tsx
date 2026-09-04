/**
 * A drawer summary's strip: stats side by side, each a small uppercase label
 * over its value, divided by hairlines, wrapping when the drawer is narrow.
 */
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

// Every stat carries its own leading hairline, and the strip shifts left by
// exactly one divider-plus-gap so each row's first divider lands outside the
// clipping wrapper — wrapped rows therefore start flush, not with a floating
// rule (a sibling selector cannot see flex line breaks).
const stripClipStyle = css({
  overflow: "hidden",
});

const stripStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  rowGap: "2",
  marginLeft: "[-17px]",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  minWidth: "[0]",
  paddingLeft: "4",
  marginLeft: "[1px]",
  borderLeftWidth: "[1px]",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
  paddingRight: "4",
});

const statLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s70",
});

const statValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// Inline-block inside the value span, so a long value still ellipsizes (a
// flex value container turns its text into an item ellipsis cannot reach).
const statusDotStyle = css({
  display: "inline-block",
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  marginRight: "1.5",
  verticalAlign: "[1px]",
  backgroundColor: "neutral.s60",
  "&[data-tone=active]": { backgroundColor: "blue.s100" },
  "&[data-tone=done]": { backgroundColor: "green.s90" },
  "&[data-tone=error]": { backgroundColor: "red.s100" },
});

const trailingStyle = css({
  display: "inline-flex",
  alignItems: "center",
  marginLeft: "auto",
  paddingLeft: "4",
});

export type SummaryStatusTone = "active" | "done" | "error" | "neutral";

export const SummaryStrip = ({
  children,
  trailing,
}: {
  children: ReactNode;
  /** Pinned to the strip's right edge, outside the stats' hairlines. */
  trailing?: ReactNode;
}) => (
  <div className={stripClipStyle}>
    <div className={stripStyle}>
      {children}
      {trailing === undefined ? null : (
        <span className={trailingStyle}>{trailing}</span>
      )}
    </div>
  </div>
);

export const SummaryStat = ({
  label,
  minChars,
  children,
}: {
  label: string;
  /** Reserve this many characters so a changing value never reflows the strip. */
  minChars?: number;
  children: ReactNode;
}) => (
  <div className={statStyle}>
    <span className={statLabelStyle}>{label}</span>
    <span
      className={statValueStyle}
      style={minChars === undefined ? undefined : { minWidth: `${minChars}ch` }}
    >
      {children}
    </span>
  </div>
);

export const SummaryStatusDot = ({ tone }: { tone: SummaryStatusTone }) => (
  <span className={statusDotStyle} data-tone={tone} />
);
