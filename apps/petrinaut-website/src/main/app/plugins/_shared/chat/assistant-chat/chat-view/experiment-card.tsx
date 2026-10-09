import { useStoreSelector } from "@hashintel/petrinaut/ui";

import { ExperimentExecutionCard } from "../../experiment-execution-card";
import { useAssistantChatApi } from "../chat-api";

import type { PetrinautAiMessage } from "../../ai-message";
import type { AiToolTarget } from "../tool-summaries";
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
  const { experiments } = useAssistantChatApi();
  const result =
    part.state === "output-available" ? part.output : state?.result;
  const experimentId = result?.experimentId ?? state?.progress?.experimentId;
  const available = useStoreSelector(
    experiments.records,
    (records) =>
      experimentId !== undefined &&
      records.some((experiment) => experiment.id === experimentId),
  );

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
