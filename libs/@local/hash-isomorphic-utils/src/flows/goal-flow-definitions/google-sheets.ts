import type { DistributiveOmit } from "@local/advanced-types/distribute";

import type {
  AiFlowActionDefinitionId,
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "../action-definitions.js";
import type { FlowDefinition } from "../types.js";

export type GoogleSheetTriggerInput = "Google Account" | "Google Sheet";

export const googleSheetTriggerInputs = [
  {
    payloadKind: "GoogleAccountId",
    name: "Google Account" satisfies GoogleSheetTriggerInput,
    array: false,
    required: true,
  },
  {
    payloadKind: "GoogleSheet",
    name: "Google Sheet" satisfies GoogleSheetTriggerInput,
    array: false,
    required: true,
  },
] satisfies FlowDefinition<AiFlowActionDefinitionId>["trigger"]["outputs"];

export const googleSheetStep = {
  kind: "action",
  actionDefinitionId: "writeGoogleSheet",
  description: "Save discovered entities to Google Sheet",
  inputSources: [
    {
      inputName:
        "audience" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
      kind: "hardcoded",
      payload: {
        kind: "ActorType",
        value: "user",
      },
    },
    {
      inputName:
        "googleAccountId" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Google Account" satisfies GoogleSheetTriggerInput,
    },
    {
      inputName:
        "googleSheet" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Google Sheet" satisfies GoogleSheetTriggerInput,
    },
    {
      inputName:
        "dataToWrite" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
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

export const googleSheetDeliverable = {
  stepOutputName:
    "googleSheetEntity" satisfies OutputNameForAiFlowAction<"writeGoogleSheet">,
  payloadKind: "PersistedEntityMetadata",
  name: "googleSheetEntity" as const,
  array: false,
  required: true,
} satisfies Omit<
  FlowDefinition<AiFlowActionDefinitionId>["outputs"][number],
  "stepId"
>;
