import { token } from "@hashintel/ds-helpers/tokens";

import type { CSSProperties } from "react";

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Shared Recharts tooltip styling. Recharts inspects the *element type* of its
// direct children, so the `<Tooltip>` element must stay inline in each chart;
// these style objects are spread into it to keep the look identical. Colors come
// from ds-components tokens (`var(--colors-…)`); charts render inside the
// supply-chain `.hash-ds-root` scope so the vars resolve.
//
// Light surface (matches the distribution chart's tooltip) — preferred for
// readability over the previous dark `neutral.s120` pill.
export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${token.var("colors.bd.subtle")}`,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  backgroundColor: token.var("colors.bgSolid.min"),
  color: token.var("colors.fg.body"),
  fontFamily: "inherit",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: token.var("colors.fg.body"),
  fontSize: 11,
};
export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: token.var("colors.fg.body"),
};
export const TOOLTIP_WRAPPER_STYLE: CSSProperties = { zIndex: 9999 };

/**
 * Formats a `YYYY-MM` string as a short `Mon YY` axis label (e.g. `Jan 24`).
 * Shared by every monthly chart (cost, trend, savings, site carry cost).
 */
export function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  if (!year || !month) {
    return ym;
  }
  const monthLabel = MONTH_ABBREVIATIONS[Number.parseInt(month, 10) - 1];
  if (!monthLabel) {
    return ym;
  }
  return `${monthLabel} ${year.slice(2)}`;
}
