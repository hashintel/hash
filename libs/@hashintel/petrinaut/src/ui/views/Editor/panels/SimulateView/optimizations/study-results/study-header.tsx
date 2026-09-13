/**
 * The frame header's headline for a study: where the study is and which step
 * is the best so far, with a verdict chip while it runs. Once settled the
 * line says how the study ended and nothing pretends to still be following.
 * The text yields before the chips do, so the chips never wrap or clip.
 */
import { Chip, type ChipColor } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { describeStudyProgress } from "../../shared/describe-study-progress";
import {
  assessConvergence,
  type ConvergenceVerdict,
  describeConvergence,
} from "./convergence";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  minHeight: "[24px]",
  fontSize: "sm",
  color: "neutral.s100",
  fontVariantNumeric: "tabular-nums",
});

const textStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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
      {optimization.status === "paused" ? (
        <span className={chipSlotStyle} data-paused-chip>
          <Chip size="xs" variant="soft" color="grey">
            Paused
          </Chip>
        </span>
      ) : null}
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
