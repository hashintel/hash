import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { ExperimentExecutionCard } from "./experiment-execution-card";

import type { AiToolTarget } from "../tool-summaries";
import type { PetrinautAiMessage } from "../types";
import type {
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";

export type ExperimentToolPart = Extract<
  PetrinautAiMessage["parts"][number],
  { type: "tool-createExperiment" }
>;

export type AiExperimentState = {
  active: boolean;
  progress?: PetrinautExperimentProgress;
  result?: PetrinautExperimentResult;
};

export const ExperimentCard = ({
  part,
  state,
  onCancel,
  onSelectToolTarget,
}: {
  part: ExperimentToolPart;
  state?: AiExperimentState;
  onCancel?: (toolCallId: string) => void;
  onSelectToolTarget?: (target: AiToolTarget) => void;
}) => {
  const { experiments } = use(ExperimentsContext);
  const result =
    part.state === "output-available" ? part.output : state?.result;
  const experimentId = result?.experimentId ?? state?.progress?.experimentId;
  const available =
    experimentId &&
    experiments.some((experiment) => experiment.id === experimentId);

  return (
    <ExperimentExecutionCard
      request={part.state === "input-streaming" ? undefined : part.input}
      active={state?.active === true}
      progress={state?.progress}
      result={result}
      error={part.state === "output-error" ? part.errorText : undefined}
      onCancel={onCancel ? () => onCancel(part.toolCallId) : undefined}
      onViewExperiment={
        available && onSelectToolTarget
          ? () =>
              onSelectToolTarget({
                kind: "simulateView",
                mode: "experiments",
                itemId: experimentId,
              })
          : undefined
      }
    />
  );
};
