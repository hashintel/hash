/**
 * A remote study's best parameters: one chip per parameter with its value,
 * the content of the Best parameters band.
 */
import { css } from "@hashintel/ds-helpers/css";

import { formatScalar } from "../../shared/format-value";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  gap: "2",
});

const parameterStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minWidth: "[0]",
  paddingX: "2.5",
  paddingY: "1.5",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.s05",
});

const nameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  fontFamily: "mono",
  color: "neutral.s120",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const valueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

export const BestParameters = ({
  best,
}: {
  best: NonNullable<OptimizationRecord["best"]>;
}) => (
  <div className={gridStyle}>
    {Object.entries(best.parameters).map(([identifier, value]) => (
      <div key={identifier} className={parameterStyle}>
        <span className={nameStyle}>{identifier}</span>
        <span className={valueStyle}>{formatScalar(value)}</span>
      </div>
    ))}
  </div>
);
