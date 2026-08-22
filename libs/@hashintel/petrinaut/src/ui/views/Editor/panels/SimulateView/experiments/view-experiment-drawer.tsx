import { use, useEffect, useState } from "react";

import { Button, Drawer, Icon, Slider, Toggle } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import {
  mergeMetricFramesAcrossCells,
  type ExperimentParameterAxis,
} from "../../../../../../react/experiments/parameter-grid";
import { Section, SectionList } from "../../../../../components/section";
import {
  ExperimentMetricTimeline,
  type MetricSize,
} from "./experiment-metric-timeline";

const summaryStyle = css({
  marginTop: "-1",
  marginBottom: "3",
});

const summaryGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "3",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
});

const statLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const statValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const progressBarStyle = css({
  height: "[6px]",
  width: "full",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
  marginTop: "4",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "neutral.s120",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const metricGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "start",
  gap: "3",
});

const metricItemStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const metricItemLargeStyle = css({
  gridColumn: "[1 / -1]",
});

const navigatorListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const navigatorHintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const navigatorRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[12px]",
  minHeight: "[32px]",
});

const navigatorNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const navigatorSliderStyle = css({
  flex: "1",
  minWidth: "[0]",
});

const navigatorValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[110px]",
  flexShrink: 0,
  textAlign: "right",
  fontVariantNumeric: "[tabular-nums]",
});

const navigatorCombinedStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
  flex: "1",
  minWidth: "[0]",
});

const navigatorRunsStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "[tabular-nums]",
});

type MetricFrame = ExperimentRecord["metricFrames"][number];

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatStatus(experiment: ExperimentRecord): string {
  switch (experiment.status) {
    case "initializing":
      return "Initializing";
    case "running":
      return "Running";
    case "idle":
      return "Idle";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
  }
}

function groupMetricFramesByMetric(
  metricFrames: readonly MetricFrame[],
): MetricFrame[][] {
  const groups = new Map<string, MetricFrame[]>();

  for (const frame of metricFrames) {
    const frames = groups.get(frame.metricId) ?? [];
    frames.push(frame);
    groups.set(frame.metricId, frames);
  }

  return [...groups.values()];
}

const ExperimentSummary = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const progress = experiment.progress;
  const isGrid = experiment.cells.length > 1;
  const totalRunBudget =
    experiment.runCount * Math.max(1, experiment.cells.length);
  const accumulatedRuns = experiment.cells.reduce(
    (sum, cell) => sum + cell.runsCompleted,
    0,
  );
  const progressPercent = isGrid
    ? totalRunBudget > 0
      ? Math.min(100, (accumulatedRuns / totalRunBudget) * 100)
      : 0
    : progress && experiment.maxTime > 0
      ? Math.min(100, (progress.time / experiment.maxTime) * 100)
      : 0;

  return (
    <div className={summaryStyle}>
      <div className={summaryGridStyle}>
        <div className={statStyle}>
          <span className={statLabelStyle}>Status</span>
          <span className={statValueStyle}>{formatStatus(experiment)}</span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Scenario</span>
          <span className={statValueStyle}>
            {experiment.scenarioName ?? "Default"}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Runs</span>
          <span className={statValueStyle}>
            {isGrid
              ? `${accumulatedRuns.toLocaleString()} / ${totalRunBudget.toLocaleString()} accumulated`
              : progress
                ? `${progress.activeRuns} active, ${progress.completedRuns} complete`
                : experiment.runCount}
          </span>
        </div>
        {isGrid ? (
          <div className={statStyle}>
            <span className={statLabelStyle}>Combinations</span>
            <span className={statValueStyle}>
              {experiment.cells.length} (
              {
                experiment.cells.filter((cell) => cell.status === "complete")
                  .length
              }{" "}
              at the {experiment.runCount.toLocaleString()}-run target)
            </span>
          </div>
        ) : null}
        <div className={statStyle}>
          <span className={statLabelStyle}>Errors</span>
          <span className={statValueStyle}>{progress?.erroredRuns ?? 0}</span>
        </div>
        {!isGrid ? (
          <>
            <div className={statStyle}>
              <span className={statLabelStyle}>Frame</span>
              <span className={statValueStyle}>
                {progress?.frameNumber ?? 0}
              </span>
            </div>
            <div className={statStyle}>
              <span className={statLabelStyle}>Time</span>
              <span className={statValueStyle}>
                {formatNumber(progress?.time ?? 0)} /{" "}
                {formatNumber(experiment.maxTime)}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className={progressBarStyle}>
        <div
          className={progressFillStyle}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {experiment.error ? (
        <span className={errorStyle}>{experiment.error}</span>
      ) : null}
    </div>
  );
};

function formatAxisValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * One row per ranged parameter. Toggled off, the parameter is marginalized:
 * the metrics below combine the runs of all its values. Toggled on, a slider
 * pins it to a single value and the metrics show only matching combinations.
 */
const ExperimentParameterNavigator = ({
  axes,
  selection,
  onSelectionChange,
}: {
  axes: readonly ExperimentParameterAxis[];
  selection: Readonly<Record<string, number | null>>;
  onSelectionChange: (identifier: string, valueIndex: number | null) => void;
}) => (
  <div className={navigatorListStyle}>
    <span className={navigatorHintStyle}>
      Toggle a parameter to pin it to a single value; parameters left off are
      combined across all their values.
    </span>
    {axes.map((axis) => {
      const selectedIndex = selection[axis.identifier] ?? null;
      const isPinned = selectedIndex !== null;
      const first = axis.values[0];
      const last = axis.values.at(-1);

      return (
        <div key={axis.identifier} className={navigatorRowStyle}>
          <Toggle
            size="sm"
            value={isPinned}
            aria-label={`Pin ${axis.identifier} to a single value`}
            onChange={(pinned) =>
              onSelectionChange(axis.identifier, pinned ? 0 : null)
            }
          />
          <span className={navigatorNameStyle}>{axis.identifier}</span>
          {isPinned ? (
            <>
              {/* 1-based slider domain; the shared Slider treats value 0 as unset. */}
              <Slider
                className={navigatorSliderStyle}
                min={1}
                max={axis.values.length}
                value={selectedIndex + 1}
                onChange={(sliderValue) =>
                  onSelectionChange(
                    axis.identifier,
                    Math.min(
                      axis.values.length - 1,
                      Math.max(0, Math.round(sliderValue) - 1),
                    ),
                  )
                }
              />
              <span className={navigatorValueStyle}>
                = {formatAxisValue(axis.values[selectedIndex])}
              </span>
            </>
          ) : (
            <span className={navigatorCombinedStyle}>
              Combined across {axis.values.length} values (
              {formatAxisValue(first)} – {formatAxisValue(last)})
            </span>
          )}
        </div>
      );
    })}
  </div>
);

const ExperimentMetricsGrid = ({
  frames,
}: {
  frames: readonly MetricFrame[];
}) => {
  const [sizes, setSizes] = useState<Record<string, MetricSize>>({});
  const metricFrameGroups = groupMetricFramesByMetric(frames);

  if (metricFrameGroups.length === 0) {
    return null;
  }

  return (
    <div className={metricGridStyle}>
      {metricFrameGroups.map((metricFrames) => {
        const latestFrame = metricFrames.at(-1)!;
        const size = sizes[latestFrame.metricId] ?? "small";

        return (
          <div
            key={latestFrame.metricId}
            className={cx(
              metricItemStyle,
              size === "large" && metricItemLargeStyle,
            )}
          >
            <ExperimentMetricTimeline
              frames={metricFrames}
              displaySize={size}
              onDisplaySizeChange={(nextSize) =>
                setSizes((previous) => ({
                  ...previous,
                  [latestFrame.metricId]: nextSize,
                }))
              }
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Parameter navigator + metric charts. Grid experiments merge the metric
 * distributions (accumulated + live batches) of every cell matching the
 * current parameter selection at render time — merging histograms is cheap,
 * so navigating the parameter space needs no recomputation. The selection is
 * also reported to the experiments provider as the run focus: the scheduler
 * progressively adds runs to whatever is in view.
 */
const ExperimentResults = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const { setExperimentRunFocus } = use(ExperimentsContext);
  const [selection, setSelection] = useState<
    Readonly<Record<string, number | null>>
  >({});
  const axes = experiment.parameterAxes;
  const isGrid = axes.length > 0;
  const experimentId = experiment.id;

  // Report the viewed selection so the scheduler refines it; pause
  // refinement when the results stop being viewed.
  useEffect(() => {
    if (!isGrid) {
      return;
    }
    setExperimentRunFocus(experimentId, selection);
  }, [experimentId, isGrid, selection, setExperimentRunFocus]);

  useEffect(() => {
    if (!isGrid) {
      return;
    }
    return () => {
      setExperimentRunFocus(experimentId, null);
    };
  }, [experimentId, isGrid, setExperimentRunFocus]);

  const matchingCells = isGrid
    ? experiment.cells.filter((cell) =>
        axes.every((axis) => {
          const pinnedIndex = selection[axis.identifier] ?? null;
          return (
            pinnedIndex === null ||
            cell.parameterValues[axis.identifier] === axis.values[pinnedIndex]
          );
        }),
      )
    : experiment.cells;

  const displayFrames = isGrid
    ? mergeMetricFramesAcrossCells(
        matchingCells.flatMap((cell) => [
          cell.metricFrames,
          cell.inFlightMetricFrames,
        ]),
      )
    : experiment.metricFrames;

  const viewedRuns = matchingCells.reduce(
    (sum, cell) => sum + cell.runsCompleted,
    0,
  );
  const viewedRunBudget = experiment.runCount * matchingCells.length;
  const isRefining = matchingCells.some(
    (cell) => cell.status === "initializing" || cell.status === "running",
  );

  return (
    <>
      {isGrid ? (
        <Section title="Parameters" collapsible defaultOpen>
          <ExperimentParameterNavigator
            axes={axes}
            selection={selection}
            onSelectionChange={(identifier, valueIndex) =>
              setSelection((previous) => ({
                ...previous,
                [identifier]: valueIndex,
              }))
            }
          />
          <span className={navigatorRunsStyle}>
            {matchingCells.length === 1
              ? "1 combination in view"
              : `${matchingCells.length} combinations in view`}
            {" · "}
            {viewedRuns.toLocaleString()} of {viewedRunBudget.toLocaleString()}{" "}
            runs accumulated
            {isRefining
              ? " — adding runs…"
              : viewedRuns >= viewedRunBudget
                ? " (at target)"
                : ""}
          </span>
        </Section>
      ) : null}
      {displayFrames.length > 0 ? (
        <Section title="Metrics" collapsible defaultOpen>
          <ExperimentMetricsGrid frames={displayFrames} />
        </Section>
      ) : null}
    </>
  );
};

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
}) => {
  const { cancelExperiment, removeExperiment } = use(ExperimentsContext);

  if (!open || !experiment) {
    return null;
  }

  // Grid experiments idle between refinements — cancelling one permanently
  // stops it from accumulating further runs.
  const canCancel =
    experiment.status === "initializing" ||
    experiment.status === "running" ||
    experiment.status === "idle";

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="experiment"
    >
      <Drawer.Header
        title={experiment.name}
        description="Monte Carlo experiment metrics"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section title="Summary" collapsible defaultOpen>
            <ExperimentSummary experiment={experiment} />
          </Section>
          {/* Keyed so the parameter selection resets when switching experiments. */}
          <ExperimentResults key={experiment.id} experiment={experiment} />
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        actions={
          <>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              prefix={<Icon name="trash" size="sm" />}
              onClick={() => {
                removeExperiment(experiment.id);
                onClose();
              }}
            >
              Remove
            </Button>
            {canCancel ? (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                prefix={<Icon name="stop" size="sm" />}
                onClick={() => cancelExperiment(experiment.id)}
              >
                Cancel
              </Button>
            ) : null}
            <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
