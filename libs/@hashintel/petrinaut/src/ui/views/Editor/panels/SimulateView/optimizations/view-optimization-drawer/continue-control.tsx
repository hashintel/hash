/**
 * The footer control that runs more steps on a settled connected study: how
 * many, then Continue. The count starts at the study's own step count and is
 * capped by the trials the study may still ask for.
 */
import { useState } from "react";

import { Button, Icon, NumberInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { PETRINAUT_OPTIMIZATION_MAX_TRIALS } from "@hashintel/petrinaut-core";

const controlStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});

const stepsInputStyle = css({
  width: "[72px]",
});

/** How many more steps a study may run before it reaches the trial cap. */
export const remainingOptimizationSteps = (requestedTrials: number): number =>
  Math.max(0, PETRINAUT_OPTIMIZATION_MAX_TRIALS - requestedTrials);

export const ContinueControl = ({
  defaultSteps,
  remainingSteps,
  onContinue,
}: {
  /** The count the input starts at; clamped to the remaining steps. */
  defaultSteps: number;
  remainingSteps: number;
  onContinue: (steps: number) => Promise<void>;
}) => {
  const [steps, setSteps] = useState<number | null>(
    Math.max(1, Math.min(defaultSteps, remainingSteps)),
  );
  const [pending, setPending] = useState(false);
  const valid =
    steps !== null &&
    Number.isInteger(steps) &&
    steps >= 1 &&
    steps <= remainingSteps;

  if (remainingSteps === 0) {
    return null;
  }

  return (
    <span className={controlStyle}>
      <NumberInput
        className={stepsInputStyle}
        aria-label="Steps to continue with"
        size="sm"
        min={1}
        max={remainingSteps}
        step={1}
        value={steps}
        disabled={pending}
        onChange={setSteps}
      />
      <Button
        variant="subtle"
        tone="neutral"
        size="sm"
        prefix={<Icon name="play" size="sm" />}
        disabled={!valid || pending}
        onClick={() => {
          if (!valid) {
            return;
          }
          setPending(true);
          void onContinue(steps).finally(() => setPending(false));
        }}
      >
        Continue
      </Button>
    </span>
  );
};
