import { css } from "@hashintel/ds-helpers/css";
/**
 * The study's constraints in one card: how many steps are clear across the
 * study as the headline, the latest step's own verdict beneath it, and one
 * bar per constraint with its pass rate over the steps that simulated. Every
 * percentage is printed beside the fraction it came from, and every row is
 * reserved so the card never changes shape as steps land.
 */
import { constraintLabel } from "@hashintel/petrinaut-core";

import {
  bindingStepRate,
  constraintAlpha,
  constraintNameIn,
  formatRate,
  passThresholdPercent,
  type StepVerdict,
  stepVerdict,
  studyConstraintRates,
} from "../../../../../../../react/optimizations/constraint-rates";
import { followedTrial } from "../../../../../../../react/optimizations/context";
import { ChartCard, type ChartCardTone } from "../../shared/chart-card";

import type {
  ConnectedStudyState,
  OptimizationRecord,
} from "../../../../../../../react/optimizations/context";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  height: "full",
  minHeight: "[0]",
  fontVariantNumeric: "tabular-nums",
});

const headlineStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
});

const headlineValueStyle = css({
  fontSize: "xl",
  fontWeight: "medium",
  color: "neutral.s120",
  lineHeight: "[1.1]",
});

const headlineLabelStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

// One line, always present, so the rows beneath never move as steps land.
const stepLineStyle = css({
  fontSize: "xs",
  color: "neutral.s100",
  minHeight: "[18px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const verdictStyle = css({
  fontWeight: "semibold",
  "&[data-verdict='clear']": { color: "green.s100" },
  "&[data-verdict='limited']": { color: "orange.s100" },
  "&[data-verdict='infeasible']": { color: "neutral.s70" },
});

const breakdownStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
  minHeight: "[0]",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 7.5rem",
  alignItems: "center",
  columnGap: "3",
  rowGap: "[3px]",
});

const rowNameStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const rowRateStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  textAlign: "right",
  whiteSpace: "nowrap",
});

const barTrackStyle = css({
  position: "relative",
  gridColumn: "[1 / -1]",
  height: "[6px]",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
});

const barFillStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "green.s90",
  "[data-animate=true] &": { transition: "[width 160ms ease-out]" },
  "&[data-below='true']": { backgroundColor: "orange.s80" },
});

// The dashed mark on every bar: a step counts as limited when the constraint
// held on fewer than this share of its runs.
const thresholdMarkStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  width: "[0]",
  borderLeftWidth: "[1px]",
  borderLeftStyle: "dashed",
  borderLeftColor: "neutral.s100",
});

const noteStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const VERDICT_WORD: Record<StepVerdict, string> = {
  clear: "clear",
  limited: "limited",
  infeasible: "infeasible",
  unconstrained: "unconstrained",
};

/**
 * The step the card describes beneath the headline: the followed step once
 * its event landed, else the latest reported step. Null before any step.
 */
export const describedStep = (
  trials: OptimizationRecord["trials"],
  selection: ConnectedStudyState["selection"],
): OptimizationRecord["trials"][number] | null => {
  const followed = selection === null ? null : followedTrial(selection.key);
  const followedEvent =
    followed === null
      ? undefined
      : trials.find((trial) => trial.trial === followed);
  if (followedEvent) {
    return followedEvent;
  }
  return trials.reduce<OptimizationRecord["trials"][number] | null>(
    (latest, trial) =>
      latest === null || trial.trial > latest.trial ? trial : latest,
    null,
  );
};

/** The step line in two parts: the verdict head the card colours, and the detail tail after it. */
export type StepLine = {
  /** "Step 12: limited" */
  verdict: string;
  /** " · 51 / 60 runs passed · Queue under 10", the infeasible draw's constraint, or "" when there is nothing to add. */
  detail: string;
};

/** "Step 12: limited · 51 / 60 runs passed · Queue under 10", or the infeasible draw's constraint. */
export const describeStep = (
  optimization: Pick<OptimizationRecord, "input">,
  trial: OptimizationRecord["trials"][number],
  alpha: number,
): StepLine => {
  const verdict = stepVerdict(trial, alpha);
  const { input } = optimization;
  const head = `Step ${trial.trial + 1}: ${VERDICT_WORD[verdict]}`;
  if (verdict === "infeasible") {
    return {
      verdict: head,
      detail: ` · ${constraintNameIn(input, trial.constraints?.infeasible ?? "")}`,
    };
  }
  const binding = bindingStepRate(trial, alpha);
  if (binding === null) {
    return {
      verdict: head,
      detail: trial.state === "complete" ? "" : ` · ${trial.state}`,
    };
  }
  return {
    verdict: head,
    detail: ` · ${formatRate(binding.runsPassed, binding.runsTotal).replace(" · ", " runs passed · ")} · ${constraintNameIn(input, binding.constraintId)}`,
  };
};

export const ConstraintSummaryCard = ({
  optimization,
  selection,
  plotHeight,
  tone,
}: {
  optimization: OptimizationRecord;
  selection: ConnectedStudyState["selection"];
  /** The body's height in pixels; the card is exactly as tall as its neighbours. */
  plotHeight: number;
  /** How the card reads: `paused` while the study is paused. */
  tone?: ChartCardTone;
}) => {
  const { input, trials } = optimization;
  const alpha = constraintAlpha(input);
  const threshold = passThresholdPercent(alpha);
  const rates = studyConstraintRates(trials, alpha);
  const constraints = input.constraints ?? [];
  const stateConstraints = constraints.filter(
    (constraint) => constraint.space === "state",
  );
  const step = describedStep(trials, selection);
  const line = step === null ? null : describeStep(optimization, step, alpha);
  const infeasibleNote =
    rates.infeasibleDraws === 0
      ? ""
      : ` · ${rates.infeasibleDraws} infeasible ${rates.infeasibleDraws === 1 ? "draw" : "draws"}`;

  return (
    <ChartCard
      title="Constraints"
      subtitle={`pass threshold ${threshold}% (alpha ${alpha})${infeasibleNote}`}
      help="A run passes a state constraint when the condition held on every sampled frame. A step is clear when every state constraint held on at least the threshold share of its runs, limited otherwise, and infeasible when its parameters broke a parameter constraint before anything ran. The objective counts every run whatever the verdicts; nothing is excluded."
      bodyHeight={plotHeight}
      tone={tone}
    >
      <div className={bodyStyle} data-constraint-summary>
        <div className={headlineStyle}>
          <span className={headlineValueStyle}>
            {formatRate(rates.stepsClear, rates.stepsSimulated)}
          </span>
          <span className={headlineLabelStyle}>
            steps clear across the study
          </span>
        </div>
        <span className={stepLineStyle}>
          {step === null || line === null ? (
            "No step reported yet"
          ) : (
            <>
              <span
                className={verdictStyle}
                data-verdict={stepVerdict(step, alpha)}
              >
                {line.verdict}
              </span>
              {line.detail}
            </>
          )}
        </span>
        <div className={breakdownStyle}>
          {stateConstraints.map((constraint) => {
            const entry = rates.perConstraint.find(
              (candidate) => candidate.constraintId === constraint.id,
            );
            const passed = entry?.stepsPassed ?? 0;
            const simulated = entry?.stepsSimulated ?? 0;
            const share = simulated === 0 ? 0 : passed / simulated;
            return (
              <div
                key={constraint.id}
                className={rowStyle}
                data-constraint-row={constraint.id}
              >
                <span className={rowNameStyle}>
                  {constraintLabel(constraint)}
                </span>
                <span className={rowRateStyle}>
                  {formatRate(passed, simulated)} steps
                </span>
                <div className={barTrackStyle}>
                  <div
                    className={barFillStyle}
                    data-below={simulated > 0 && share < 1 - alpha}
                    style={{ width: `${share * 100}%` }}
                  />
                  <div
                    className={thresholdMarkStyle}
                    style={{ left: `${threshold}%` }}
                    title={`Step counted as limited below ${threshold}% of runs`}
                  />
                </div>
              </div>
            );
          })}
          {constraints.length > stateConstraints.length ? (
            <span className={noteStyle}>
              {constraints.length - stateConstraints.length} parameter{" "}
              {constraints.length - stateConstraints.length === 1
                ? "constraint is"
                : "constraints are"}{" "}
              checked before each step runs.
            </span>
          ) : null}
        </div>
      </div>
    </ChartCard>
  );
};
