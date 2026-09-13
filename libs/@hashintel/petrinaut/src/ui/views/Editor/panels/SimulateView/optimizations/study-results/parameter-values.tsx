/**
 * Parameter values, read only: one row per parameter with its name on the
 * left and its value on the right, as many columns as fit. The parameters a
 * study holds fixed, and a remote study's best parameters, which read `—`
 * until a step reports so the rows are there from the start.
 */
import { css } from "@hashintel/ds-helpers/css";

import { formatScalar } from "../../shared/format-value";

import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
  columnGap: "8",
  rowGap: "[6px]",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minWidth: "[0]",
  height: "[20px]",
});

const nameStyle = css({
  fontSize: "xs",
  color: "neutral.s110",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const valueStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

export const ParameterValues = ({
  values,
}: {
  values: Readonly<Record<string, OptimizationScalar | null>>;
}) => (
  <div className={gridStyle} data-parameter-values>
    {Object.entries(values).map(([identifier, value]) => (
      <div key={identifier} className={rowStyle}>
        <span className={nameStyle} title={identifier}>
          {identifier}
        </span>
        <span className={valueStyle}>
          {value === null ? "—" : formatScalar(value)}
        </span>
      </div>
    ))}
  </div>
);
