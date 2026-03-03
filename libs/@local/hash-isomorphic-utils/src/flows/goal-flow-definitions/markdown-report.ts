import type { DistributiveOmit } from "@local/advanced-types/distribute";

import type {
  AiFlowActionDefinitionId,
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "../action-definitions.js";
import type { ActionStepDefinition, FlowDefinition } from "../types.js";

export type ReportTriggerInput = "Report specification";

export const markdownReportTriggerInputs = [
  {
    payloadKind: "Text",
    name: "Report specification" satisfies ReportTriggerInput,
    array: false,
    required: true,
  },
] satisfies FlowDefinition<AiFlowActionDefinitionId>["trigger"]["outputs"];

export const markdownReportResearchEntitiesStepInput = {
  inputName:
    "reportSpecification" satisfies InputNameForAiFlowAction<"researchEntities">,
  kind: "step-output",
  sourceStepId: "trigger",
  sourceStepOutputName: "Report specification" satisfies ReportTriggerInput,
} as const satisfies ActionStepDefinition["inputSources"][number];

export const markdownReportStep = {
  kind: "action",
  actionDefinitionId: "answerQuestion",
  description: "Write report based on the research specification",
  inputSources: [
    {
      inputName:
        "question" satisfies InputNameForAiFlowAction<"answerQuestion">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Report specification",
    },
    {
      inputName:
        "entities" satisfies InputNameForAiFlowAction<"answerQuestion">,
      kind: "step-output",
      sourceStepId: "2",
      sourceStepOutputName:
        "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
    },
  ],
} satisfies DistributiveOmit<
  FlowDefinition<AiFlowActionDefinitionId>["steps"][number],
  "stepId" | "groupId"
>;

export const markdownReportDeliverable = {
  stepOutputName:
    "answer" satisfies OutputNameForAiFlowAction<"answerQuestion">,
  payloadKind: "Text",
  name: "report" as const,
  array: false,
  required: true,
} satisfies Omit<
  FlowDefinition<AiFlowActionDefinitionId>["outputs"][number],
  "stepId"
>;
