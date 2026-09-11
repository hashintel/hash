/**
 * One dimension a metric chart's data can be collapsed along, as a block of
 * the chart options: its heading, a switch between drawing everything and
 * aggregating, and the list the switch's side offers — what to draw, or which
 * statistic to take. Derived from the settings alone, so reopening the menu
 * loses nothing and switching back shows the choice that side last had.
 */
import { Select, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const headingStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[16px]",
  letterSpacing: "[0.48px]",
  textTransform: "uppercase",
  color: "neutral.s100",
});

const controlsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const selectStyle = css({
  width: "[128px]",
  minWidth: "[0]",
});

type AggregationMode = "trace" | "aggregate";

const typedKeys = <Key extends string>(record: Record<Key, string>): Key[] =>
  Object.keys(record) as Key[];

export type AggregationDimensionProps<
  Trace extends string,
  Statistic extends string,
> = {
  /** "Runs" or "Time": the block's heading and the controls' accessible names. */
  label: string;
  /** The segment that draws everything: "Every run", "Every step". */
  traceLabel: string;
  aggregate: boolean;
  onAggregateChange: (aggregate: boolean) => void;
  /** What can be drawn when nothing is aggregated, with its label. */
  traces: Record<Trace, string>;
  trace: Trace;
  onTraceChange: (trace: Trace) => void;
  /** The statistics the dimension can collapse to, with their labels. */
  statistics: Record<Statistic, string>;
  statistic: Statistic;
  onStatisticChange: (statistic: Statistic) => void;
};

export const AggregationDimension = <
  Trace extends string,
  Statistic extends string,
>({
  label,
  traceLabel,
  aggregate,
  onAggregateChange,
  traces,
  trace,
  onTraceChange,
  statistics,
  statistic,
  onStatisticChange,
}: AggregationDimensionProps<Trace, Statistic>) => (
  <div className={blockStyle}>
    <span className={headingStyle}>{label}</span>
    <div className={controlsStyle}>
      <SegmentedControl<AggregationMode>
        size="xs"
        aria-label={`${label} mode`}
        items={[
          { value: "trace", label: traceLabel },
          { value: "aggregate", label: "Aggregate" },
        ]}
        value={aggregate ? "aggregate" : "trace"}
        onChange={(mode) => onAggregateChange(mode === "aggregate")}
      />
      {aggregate ? (
        <Select
          size="xs"
          required
          aria-label={label}
          className={selectStyle}
          items={typedKeys(statistics).map((key) => ({
            value: key,
            text: statistics[key],
          }))}
          value={statistic}
          onChange={onStatisticChange}
        />
      ) : (
        <Select
          size="xs"
          required
          aria-label={label}
          className={selectStyle}
          items={typedKeys(traces).map((key) => ({
            value: key,
            text: traces[key],
          }))}
          value={trace}
          onChange={onTraceChange}
        />
      )}
    </div>
  </div>
);
