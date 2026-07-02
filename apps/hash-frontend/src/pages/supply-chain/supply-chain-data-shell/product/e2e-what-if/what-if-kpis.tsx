import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../../shared/cost";

import type { Caveat } from "./caveats";

const tile = css({
  bg: "bg.subtle",
  borderRadius: "lg",
  p: "2.5",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});
const tileSuccess = css({
  bg: "status.success.bg.subtle",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.success.bd.subtle",
});
const tileLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
});
const tileValue = css({
  textStyle: "base",
  fontWeight: "medium",
  color: "fg.max",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "[20px]",
});
const tileFoot = css({
  textStyle: "xxs",
  fontVariantNumeric: "tabular-nums",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const deltaGood = css({ color: "status.success.fg.body" });
const deltaMuted = css({ color: "fg.subtle" });
const subtleText = css({ color: "fg.subtle" });

const chipBase = css({
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  px: "2",
  py: "1.5",
  textStyle: "xs",
  lineHeight: "snug",
});
const chipWarning = css({
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
  borderColor: "status.error.bd.subtle",
});
const chipInfo = css({
  bg: "bg.subtle",
  color: "fg.heading",
  borderColor: "bd.subtle",
});
const chipLabel = css({ fontWeight: "medium" });
const chipDetail = css({ textStyle: "xxs", mt: "0.5", opacity: "0.9" });

export const KpiTile = ({
  label,
  value,
  subtle,
  delta,
  deltaUnit,
  success,
}: {
  label: string;
  value: string;
  subtle?: string;
  delta?: number | null;
  deltaUnit?: string;
  success?: boolean;
}) => {
  const deltaText =
    delta != null && delta !== 0
      ? `${delta > 0 ? "+" : ""}${formatNumber(delta, { maximumFractionDigits: 1 })}${deltaUnit ?? ""}`
      : null;
  const deltaClass = delta != null && delta < 0 ? deltaGood : deltaMuted;
  return (
    <div className={cx(tile, success && tileSuccess)}>
      <div className={tileLabel}>{label}</div>
      <div className={tileValue}>{value}</div>
      <div className={tileFoot}>
        {deltaText ? <span className={deltaClass}>{deltaText}</span> : <span />}
        {subtle && <span className={subtleText}>{subtle}</span>}
      </div>
    </div>
  );
};

export const CaveatChip = ({ caveat }: { caveat: Caveat }) => {
  return (
    <div
      className={cx(
        chipBase,
        caveat.severity === "warning" ? chipWarning : chipInfo,
      )}
    >
      <div className={chipLabel}>{caveat.label}</div>
      <div className={chipDetail}>{caveat.detail}</div>
    </div>
  );
};
