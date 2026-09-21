import { Chip, type ChipColor } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { describeStudyProgress } from "../../shared/describe-study-progress";
import {
  assessConvergence,
  type ConvergenceVerdict,
  describeConvergence,
} from "./study-header/convergence";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const headerStyle = css({
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
  gap: "2",
  minWidth: "[0]",
  minHeight: "[24px]",
  fontSize: "xs",
  color: "neutral.s100",
  fontVariantNumeric: "tabular-nums",
});

const textStyle = css({
  minWidth: "[0]",
  overflowWrap: "anywhere",
});

const chipSlotStyle = css({
  flexShrink: "0",
});

const VERDICT_COLOR: Record<ConvergenceVerdict["kind"], ChipColor> = {
  "too-early": "grey",
  improving: "blue",
  converging: "green",
};

export const StudyHeader = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const verdict =
    optimization.status === "running"
      ? assessConvergence(
          optimization.trials,
          optimization.input.objective.direction,
          optimization.requestedTrials,
        )
      : null;

  return (
    <div className={headerStyle} data-study-header>
      <span className={textStyle}>{describeStudyProgress(optimization)}</span>
      {verdict === null ? null : (
        <span className={chipSlotStyle} data-verdict={verdict.kind}>
          <Chip size="xs" variant="soft" color={VERDICT_COLOR[verdict.kind]}>
            {describeConvergence(verdict)}
          </Chip>
        </span>
      )}
    </div>
  );
};
