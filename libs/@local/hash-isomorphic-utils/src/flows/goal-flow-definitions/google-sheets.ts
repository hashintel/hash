import type { DistributiveOmit } from "@local/advanced-types/distribute";

import type {
  InputNameForAction,
  OutputNameForAction,
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
] satisfies FlowDefinition["trigger"]["outputs"];

export const googleSheetStep = {
  kind: "action",
  actionDefinitionId: "writeGoogleSheet",
  description: "Save discovered entities to Google Sheet",
  inputSources: [
    {
      inputName: "audience" satisfies InputNameForAction<"writeGoogleSheet">,
      kind: "hardcoded",
      payload: {
        kind: "ActorType",
        value: "human",
      },
    },
    {
      inputName:
        "googleAccountId" satisfies InputNameForAction<"writeGoogleSheet">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Google Account" satisfies GoogleSheetTriggerInput,
    },
    {
      inputName: "googleSheet" satisfies InputNameForAction<"writeGoogleSheet">,
      kind: "step-output",
      sourceStepId: "trigger",
      sourceStepOutputName: "Google Sheet" satisfies GoogleSheetTriggerInput,
    },
    {
      inputName: "dataToWrite" satisfies InputNameForAction<"writeGoogleSheet">,
      kind: "step-output",
      sourceStepId: "2",
      sourceStepOutputName:
        "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
    },
  ],
} satisfies DistributiveOmit<
  FlowDefinition["steps"][number],
  "stepId" | "groupId"
>;

export const googleSheetDeliverable = {
  stepOutputName:
    "googleSheetEntity" satisfies OutputNameForAction<"writeGoogleSheet">,
  payloadKind: "PersistedEntity",
  name: "googleSheetEntity" as const,
  array: false,
  required: true,
} satisfies Omit<FlowDefinition["outputs"][number], "stepId">;
