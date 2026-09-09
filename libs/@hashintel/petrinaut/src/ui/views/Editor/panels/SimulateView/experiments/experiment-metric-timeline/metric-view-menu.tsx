/**
 * A metric chart's view menu, in its card header: one "Runs" group choosing
 * how the runs collapse (distribution metrics only) and one "Time" group
 * choosing how the series reads along time. The current choice in each group
 * is marked; picking another replaces it.
 */
import { ChartCardMenu } from "../../shared/chart-card";
import {
  DISTRIBUTION_VIEW_LABELS,
  RUN_AGGREGATION_LABELS,
  TIME_AGGREGATION_LABELS,
  TIME_TRACE_LABELS,
} from "./describe-metric-view";

import type { MetricFrame } from "./shared/metric-frames";
import type { MetricViewSettings } from "./view-state";
import type { Menu } from "@hashintel/ds-components";
import type { ComponentProps } from "react";

type MenuEntries = ComponentProps<typeof Menu>["items"];

/** One choice: whether the settings already hold it, and the settings that would. */
type ViewChoice = {
  id: string;
  text: string;
  isSelected: (settings: MetricViewSettings) => boolean;
  apply: (settings: MetricViewSettings) => MetricViewSettings;
};

const typedKeys = <Key extends string>(record: Record<Key, string>): Key[] =>
  Object.keys(record) as Key[];

const runsChoices: readonly ViewChoice[] = [
  ...typedKeys(DISTRIBUTION_VIEW_LABELS).map(
    (distributionView): ViewChoice => ({
      id: `runs-view-${distributionView}`,
      text: DISTRIBUTION_VIEW_LABELS[distributionView],
      isSelected: (settings) =>
        !settings.aggregateRuns &&
        settings.distributionView === distributionView,
      apply: (settings) => ({
        ...settings,
        aggregateRuns: false,
        distributionView,
      }),
    }),
  ),
  ...typedKeys(RUN_AGGREGATION_LABELS).map(
    (runAggregation): ViewChoice => ({
      id: `runs-aggregate-${runAggregation}`,
      text: RUN_AGGREGATION_LABELS[runAggregation],
      isSelected: (settings) =>
        settings.aggregateRuns && settings.runAggregation === runAggregation,
      apply: (settings) => ({
        ...settings,
        aggregateRuns: true,
        runAggregation,
      }),
    }),
  ),
];

const timeChoices: readonly ViewChoice[] = [
  ...typedKeys(TIME_TRACE_LABELS).map(
    (timeTrace): ViewChoice => ({
      id: `time-trace-${timeTrace}`,
      text: TIME_TRACE_LABELS[timeTrace],
      isSelected: (settings) =>
        !settings.aggregateTime && settings.timeTrace === timeTrace,
      apply: (settings) => ({ ...settings, aggregateTime: false, timeTrace }),
    }),
  ),
  ...typedKeys(TIME_AGGREGATION_LABELS).map(
    (timeAggregation): ViewChoice => ({
      id: `time-aggregate-${timeAggregation}`,
      text: `${TIME_AGGREGATION_LABELS[timeAggregation]} over time`,
      isSelected: (settings) =>
        settings.aggregateTime && settings.timeAggregation === timeAggregation,
      apply: (settings) => ({
        ...settings,
        aggregateTime: true,
        timeAggregation,
      }),
    }),
  ),
];

/** The menu's entries for these settings; picking one calls `onChange` with the new settings. */
export const metricViewMenuItems = (
  outputType: MetricFrame["outputType"],
  value: MetricViewSettings,
  onChange: (settings: MetricViewSettings) => void,
): MenuEntries => {
  const group = (
    id: string,
    label: string,
    choices: readonly ViewChoice[],
  ) => ({
    id,
    label,
    items: choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      selected: choice.isSelected(value),
      onClick: () => onChange(choice.apply(value)),
    })),
  });
  return [
    ...(outputType === "distribution"
      ? [group("runs", "Runs", runsChoices)]
      : []),
    group("time", "Time", timeChoices),
  ];
};

export const MetricViewMenu = ({
  outputType,
  value,
  onChange,
}: {
  outputType: MetricFrame["outputType"];
  value: MetricViewSettings;
  onChange: (settings: MetricViewSettings) => void;
}) => (
  <ChartCardMenu
    label="Chart options"
    items={metricViewMenuItems(outputType, value, onChange)}
  />
);
