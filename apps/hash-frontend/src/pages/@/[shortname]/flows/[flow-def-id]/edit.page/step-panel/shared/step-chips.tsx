import { Chip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getStepDisplay } from "../../shared/step-display";
import { getStepName } from "./find-step";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

const stepChips = css({ display: "flex", flexWrap: "wrap", gap: "1" });

/** A chip per step, with the step's icon and name. */
export const StepChips = ({ steps }: { steps: StepDefinition<string>[] }) => (
  <span className={stepChips}>
    {steps.map((step) => (
      <Chip
        key={step.stepId}
        size="md"
        prefix={{ iconName: getStepDisplay(step).icon }}
      >
        {getStepName(step)}
      </Chip>
    ))}
  </span>
);
