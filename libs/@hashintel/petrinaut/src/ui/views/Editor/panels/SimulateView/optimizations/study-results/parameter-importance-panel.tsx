/**
 * The Sensitivity analysis card: one row per optimized parameter with a bar
 * for the PED-ANOVA share the optimizer last reported and a column for the
 * signed correlation computed here from the steps. Below the study's floor the
 * card is muted and the bars fade, so a confident chart never sits on a
 * handful of steps; the correlation column stays legible in both states.
 */
import { css, cx } from "@hashintel/ds-helpers/css";

import { ChartCard, type ChartCardTone } from "../../shared/chart-card";
import {
  describeImportance,
  formatCorrelation,
  formatImportance,
  importanceRows,
} from "./importance-view";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  height: "full",
  minHeight: "[0]",
  fontVariantNumeric: "tabular-nums",
});

const columnsStyle = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 9rem) minmax(0, 1fr) 4.5rem",
  alignItems: "center",
  columnGap: "3",
});

const headerRowStyle = css({
  paddingBottom: "1",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const headerCellStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  "&[data-align='right']": { textAlign: "right" },
});

const rowsStyle = css({
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
  minHeight: "[0]",
});

// Every row is exactly this tall, so a card never changes shape as
// estimates land or the sort order changes.
const rowStyle = css({
  height: "[30px]",
  flexShrink: "0",
});

const nameStyle = css({
  fontSize: "xs",
  color: "neutral.s110",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "[data-estimated='false'] &": { color: "neutral.s70" },
});

const barCellStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
});

const barTrackStyle = css({
  position: "relative",
  flex: "[1]",
  height: "[8px]",
  backgroundColor: "neutral.s20",
  borderRadius: "full",
  overflow: "hidden",
});

const barFillStyle = css({
  display: "block",
  height: "full",
  borderRadius: "full",
  backgroundColor: "blue.s100",
  transition: "[width 160ms ease-out]",
  "[data-below-floor='true'] &": { opacity: "[0.25]" },
});

const barValueStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  minWidth: "[2.5rem]",
  textAlign: "right",
  whiteSpace: "nowrap",
  "[data-estimated='false'] &": { color: "neutral.s70" },
});

const correlationStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  textAlign: "right",
  whiteSpace: "nowrap",
  "&[data-known='false']": { color: "neutral.s70" },
});

const HELP =
  "PED-ANOVA looks at the best tenth of the completed steps and measures how far each parameter's values there are concentrated relative to its whole range: the parameter whose good values are the most concentrated matters most for reaching top results. Shares are relative and sum to 100%. Correlation is the signed Pearson correlation of each parameter with the objective over the completed steps, computed from the steps themselves, so it is available from the third completed step. Below the floor the estimate is faded: treat it as a hint.";

export const ParameterImportancePanel = ({
  optimization,
  plotHeight,
  tone,
}: {
  optimization: OptimizationRecord;
  /** The body's height in pixels; the card is exactly as tall as its neighbours. */
  plotHeight: number;
  /** `paused` reads as paused whatever the floor says; otherwise the floor decides. */
  tone?: ChartCardTone;
}) => {
  const view = importanceRows(optimization);

  return (
    <ChartCard
      title="Sensitivity analysis"
      subtitle={describeImportance(view)}
      help={HELP}
      bodyHeight={plotHeight}
      tone={tone ?? (view.belowFloor ? "muted" : "default")}
    >
      <div
        className={bodyStyle}
        data-importance-panel
        data-below-floor={view.belowFloor}
      >
        <div className={cx(columnsStyle, headerRowStyle)}>
          <span className={headerCellStyle}>Parameter</span>
          <span className={headerCellStyle}>Share</span>
          <span className={headerCellStyle} data-align="right">
            Correlation
          </span>
        </div>
        <div className={rowsStyle}>
          {view.rows.map((row) => (
            <div
              key={row.identifier}
              className={cx(columnsStyle, rowStyle)}
              data-importance-row={row.identifier}
              data-estimated={row.importance !== null}
            >
              <span className={nameStyle}>{row.identifier}</span>
              <span className={barCellStyle}>
                <span className={barTrackStyle}>
                  <span
                    className={barFillStyle}
                    data-importance-bar
                    style={{
                      width: `${((row.importance ?? 0) / view.barScale) * 100}%`,
                    }}
                  />
                </span>
                <span className={barValueStyle}>
                  {row.importance === null
                    ? "—"
                    : formatImportance(row.importance)}
                </span>
              </span>
              <span
                className={correlationStyle}
                data-known={row.correlation !== null}
              >
                {row.correlation === null
                  ? "—"
                  : formatCorrelation(row.correlation)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
};
