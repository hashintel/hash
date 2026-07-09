import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../cost";
import { DeltaIcon } from "./step-detail-primitives";

import type { PeriodComparison } from "../period-trends";
import type { StepStats } from "../types";

const card = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const cardRow = css({ display: "flex" });
const cell = css({
  flex: "1",
  p: "3",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const cellEnd = css({
  flex: "1",
  p: "3",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
});
const label = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
  mb: "2.5",
});
const valueRow = css({ display: "flex", alignItems: "center", gap: "1.5" });
const valueRowRel = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  position: "relative",
});
const valueBase = css({
  textStyle: "base",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
});
const valueStrong = css({ color: "fg.max" });
const valueDanger = css({ color: "status.error.fg.body" });
const valueTeal = css({ color: "[#12a594]" });
const valueMuted = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.subtle",
});
const orders = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  letterSpacing: "[0.12px]",
});
const badgeBase = css({
  position: "absolute",
  right: "0",
  bottom: "0",
  display: "inline-flex",
  alignItems: "center",
  textStyle: "xs",
  fontWeight: "medium",
  borderRadius: "sm",
  px: "1.5",
  h: "4",
  lineHeight: "[11px]",
  borderWidth: "1px",
  borderStyle: "solid",
});
const badgeSuccess = css({
  bg: "status.success.bg.subtle",
  color: "status.success.fg.body",
  borderColor: "status.success.bd.subtle",
});
const badgeDanger = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderColor: "status.error.bd.subtle",
});

export const YieldMetricsRow = ({
  stats,
  reference,
  comparison,
}: {
  stats: StepStats;
  reference: number;
  comparison: PeriodComparison | null;
}) => {
  return (
    <div className={card}>
      <div className={cardRow}>
        <div className={cell}>
          <div className={label}>Planned receipt ratio</div>
          <div className={valueRow}>
            <span className={cx(valueBase, valueStrong)}>{reference}%</span>
          </div>
        </div>

        <div className={cell}>
          <div className={label}>Actual median receipt ratio</div>
          <div className={valueRowRel}>
            <span
              className={cx(
                valueBase,
                stats.median != null && stats.median < reference * 0.95
                  ? valueDanger
                  : valueStrong,
              )}
            >
              {stats.median != null
                ? `${formatNumber(stats.median, { maximumFractionDigits: 1 })}%`
                : "–"}
            </span>
            {stats.median != null && (
              <span
                className={cx(
                  badgeBase,
                  stats.median >= reference ? badgeSuccess : badgeDanger,
                )}
              >
                {stats.median >= reference
                  ? "at/above order qty"
                  : `${formatNumber(reference - stats.median, { maximumFractionDigits: 1 })}% below order qty`}
              </span>
            )}
          </div>
        </div>

        <div className={cell}>
          <div className={label}>vs Previous period</div>
          <div className={valueRow}>
            {comparison?.medianPctChange != null ? (
              <>
                <DeltaIcon value={comparison.medianPctChange} invertColor />
                <span
                  className={cx(
                    valueBase,
                    comparison.medianPctChange > 0 ? valueTeal : valueDanger,
                  )}
                >
                  {comparison.medianPctChange > 0 ? "+" : ""}
                  {formatNumber(comparison.medianPctChange, {
                    maximumFractionDigits: 0,
                  })}
                  %
                </span>
              </>
            ) : (
              <span className={valueMuted}>–</span>
            )}
          </div>
        </div>

        <div className={cellEnd}>
          <span className={orders}>{formatNumber(stats.n)} orders</span>
        </div>
      </div>
    </div>
  );
};
