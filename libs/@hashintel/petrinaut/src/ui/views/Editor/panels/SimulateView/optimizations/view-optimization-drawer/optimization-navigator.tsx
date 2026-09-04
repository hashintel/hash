/**
 * The parameter navigator of a connected study, in two parts the drawer
 * places apart: `OptimizationNavigator` is the controls — a slider per
 * numeric optimized parameter and a switch per boolean one — and
 * `OptimizationNavigatorStatus` is the state line for the compute at the
 * navigated point with the "Follow steps" switch while the study runs. Both
 * are presentational: the navigation and the selection stream come in as
 * props, and the only output is `onNavigationChange`, whose patches the owner
 * forwards to the provider. Slider moves commit live — positions are
 * quantized, so a drag emits one change per step crossed and compute follows
 * the thumb. While a running study is followed, the optimizer places the
 * point and the controls only show it; "Follow steps" is the way to take over
 * early, and once the study is over the controls are free.
 */
import { LoadingSpinner, Slider, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { followedTrial } from "../../../../../../../react/optimizations/context";
import {
  optimizationAxisMidpoint,
  optimizationAxisValueAt,
} from "../../../../../../../react/optimizations/surface-grid";
import { formatAxisValue } from "../../shared/format-axis-value";

import type {
  OptimizationNavigation,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";
import type { OptimizationSurfaceAxis } from "../../../../../../../react/optimizations/surface-grid";

/** The status line under the controls. */
export const describeSelection = (
  selection: OptimizationSelectionStream | null,
): string => {
  if (selection === null) {
    return "waiting for compute";
  }
  if (selection.error !== null) {
    return `Could not compute: ${selection.error}`;
  }
  const step = followedTrial(selection.key);
  if (step !== null) {
    return selection.computing
      ? `Following step ${step + 1}`
      : `Step ${step + 1} — ${selection.runsCompleted} runs`;
  }
  if (selection.computing) {
    return selection.runTarget === null
      ? `${selection.runsCompleted} runs — computing`
      : `${selection.runsCompleted} of ${selection.runTarget} runs — refining`;
  }
  return selection.note ?? `${selection.runsCompleted} runs`;
};

/** The value distance to the neighbouring position, for readout precision. */
const axisStepAt = (axis: OptimizationSurfaceAxis, position: number): number =>
  Math.abs(
    optimizationAxisValueAt(axis, Math.min(position + 1, axis.stepCount)) -
      optimizationAxisValueAt(axis, Math.max(position - 1, 0)),
  ) / 2;

// Two columns of controls when the band is wide enough for two readable
// sliders, so several parameters cost one row per pair.
const navigatorStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
  columnGap: "8",
  rowGap: "[6px]",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const nameStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[120px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const controlStyle = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
});

const readoutStyle = css({
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  width: "[96px]",
  flexShrink: 0,
  textAlign: "right",
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  minHeight: "[24px]",
});

const spinnerSlotStyle = css({
  display: "inline-flex",
  "&[data-idle=true]": { visibility: "hidden" },
});

const statusTextStyle = css({
  "&[data-tone=error]": {
    color: "red.s100",
    whiteSpace: "pre-wrap",
  },
});

const followStyle = css({
  marginLeft: "2",
  fontSize: "xs",
  color: "neutral.s100",
});

/** Whether a running study's steps place the point, leaving the controls to show it. */
const isFollowing = (
  navigation: Pick<OptimizationNavigation, "followTrials">,
  running: boolean,
): boolean => running && navigation.followTrials;

export const OptimizationNavigator = ({
  axes,
  booleanParameters,
  navigation,
  running,
  onNavigationChange,
}: {
  axes: readonly OptimizationSurfaceAxis[];
  /** Identifiers of the boolean optimized parameters. */
  booleanParameters: readonly string[];
  navigation: OptimizationNavigation;
  /** Whether the study still evaluates steps the navigation can follow. */
  running: boolean;
  onNavigationChange: (patch: Partial<OptimizationNavigation>) => void;
}) => {
  const following = isFollowing(navigation, running);

  return (
    <div className={navigatorStyle}>
      {axes.map((axis) => {
        const position =
          navigation.positions[axis.identifier] ??
          optimizationAxisMidpoint(axis);
        return (
          <div className={rowStyle} key={axis.identifier}>
            <span className={nameStyle} title={axis.identifier}>
              {axis.identifier}
            </span>
            <Slider
              className={controlStyle}
              min={0}
              max={axis.stepCount}
              step={1}
              value={position}
              disabled={following}
              onChange={(next) => {
                if (next !== position) {
                  onNavigationChange({
                    positions: {
                      ...navigation.positions,
                      [axis.identifier]: next,
                    },
                    followTrials: false,
                  });
                }
              }}
            />
            <span className={readoutStyle}>
              {formatAxisValue(
                optimizationAxisValueAt(axis, position),
                axisStepAt(axis, position),
              )}
            </span>
          </div>
        );
      })}
      {booleanParameters.map((identifier) => {
        const value = navigation.booleans[identifier] ?? false;
        return (
          <div className={rowStyle} key={identifier}>
            <span className={nameStyle} title={identifier}>
              {identifier}
            </span>
            <span className={controlStyle}>
              <Toggle
                size="sm"
                aria-label={identifier}
                value={value}
                disabled={following}
                onChange={(next) =>
                  onNavigationChange({
                    booleans: { ...navigation.booleans, [identifier]: next },
                    followTrials: false,
                  })
                }
              />
            </span>
            <span className={readoutStyle}>{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
};

export const OptimizationNavigatorStatus = ({
  navigation,
  selection,
  running,
  onNavigationChange,
}: {
  navigation: Pick<OptimizationNavigation, "followTrials">;
  selection: OptimizationSelectionStream | null;
  /** Whether the study still evaluates steps the navigation can follow. */
  running: boolean;
  onNavigationChange: (patch: Partial<OptimizationNavigation>) => void;
}) => (
  <div className={statusStyle}>
    <span
      className={spinnerSlotStyle}
      data-idle={!(selection?.computing ?? false)}
    >
      <LoadingSpinner size="xs" />
    </span>
    <span
      className={statusTextStyle}
      data-tone={
        selection !== null && selection.error !== null ? "error" : undefined
      }
    >
      {describeSelection(selection)}
    </span>
    {running ? (
      <Toggle
        className={followStyle}
        size="sm"
        labelOnText="Follow steps"
        value={navigation.followTrials}
        onChange={(followTrials) => onNavigationChange({ followTrials })}
      />
    ) : null}
  </div>
);
