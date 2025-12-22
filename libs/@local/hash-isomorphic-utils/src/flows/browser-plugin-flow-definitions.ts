import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "./action-definitions.js";
import type {
  AutomaticInferenceTriggerInputName,
  AutomaticInferenceTriggerInputs,
  ManualInferenceTriggerInputName,
  ManualInferenceTriggerInputs,
} from "./browser-plugin-flow-types.js";
import { browserInferenceFlowOutput } from "./browser-plugin-flow-types.js";
import type { FlowDefinition } from "./types.js";

export const manualBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Analyze webpage",
  flowDefinitionId: "manual-browser-inference" as EntityUuid,
  description: "Find entities of the requested types in a web page",
  trigger: {
    kind: "trigger",
    description: "Triggered manually by user for a specific web page",
    triggerDefinitionId: "userTrigger",
    outputs: [
      {
        payloadKind:
          "WebPage" satisfies ManualInferenceTriggerInputs["visitedWebPage"]["kind"],
        description: "The web page visited",
        name: "visitedWebPage" satisfies ManualInferenceTriggerInputName,
        array: false,
        required: true,
      },
      {
        payloadKind:
          "VersionedUrl" satisfies ManualInferenceTriggerInputs["entityTypeIds"]["kind"],
        description: "The ids of the entity types to create entities of",
        name: "entityTypeIds" satisfies ManualInferenceTriggerInputName,
        array: true,
        required: true,
      },
      {
        payloadKind:
          "Text" satisfies ManualInferenceTriggerInputs["model"]["kind"],
        description: "The model to use for inference",
        name: "model" satisfies ManualInferenceTriggerInputName,
        array: true,
        required: true,
      },
      {
        payloadKind:
          "Boolean" satisfies ManualInferenceTriggerInputs["draft"]["kind"],
        description: "Whether the entities should be created as drafts or not",
        name: "draft" satisfies ManualInferenceTriggerInputName,
        array: false,
        required: true,
      },
    ],
  },
  steps: [
    {
      stepId: "0",
      kind: "action",
      actionDefinitionId: "inferEntitiesFromContent",
      description: "Find entities in web page content",
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPage" satisfies ManualInferenceTriggerInputName,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "entityTypeIds" satisfies ManualInferenceTriggerInputName,
        },
        {
          inputName:
            "model" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "model" satisfies ManualInferenceTriggerInputName,
        },
      ],
    },
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "persistEntities",
      description: "Save proposed entities to database",
      inputSources: [
        {
          inputName:
            "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAiFlowAction<"inferEntitiesFromContent">,
        },
        {
          inputName:
            "draft" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "draft" satisfies ManualInferenceTriggerInputName,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "1",
      stepOutputName:
        "persistedEntities" as const satisfies OutputNameForAiFlowAction<"persistEntities">,
      ...browserInferenceFlowOutput,
    },
  ],
};

export const automaticBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Auto-analyze webpage",
  flowDefinitionId: "automatic-browser-inference" as EntityUuid,
  description:
    "Find entities in a web page according to the user's passive analysis settings",
  trigger: {
    kind: "trigger",
    description: "Triggered automatically when the user visited a web page",
    triggerDefinitionId: "userVisitedWebPageTrigger",
    outputs: [
      {
        payloadKind:
          "WebPage" satisfies AutomaticInferenceTriggerInputs["visitedWebPage"]["kind"],
        description: "The web page visited",
        name: "visitedWebPage" satisfies AutomaticInferenceTriggerInputName,
        array: false,
        required: true,
      },
    ],
  },
  steps: [
    {
      stepId: "0",
      kind: "action",
      actionDefinitionId: "processAutomaticBrowsingSettings",
      description:
        "Decide which types of entity to find given the web page visited",
      inputSources: [
        {
          inputName:
            "webPage" satisfies InputNameForAiFlowAction<"processAutomaticBrowsingSettings">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPage" satisfies AutomaticInferenceTriggerInputName,
        },
      ],
    },
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "inferEntitiesFromContent",
      description: "Infer entities from web page content",
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPage" satisfies AutomaticInferenceTriggerInputName,
        },
        {
          inputName:
            "model" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "model" satisfies OutputNameForAiFlowAction<"processAutomaticBrowsingSettings">,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "entityTypeIds" satisfies OutputNameForAiFlowAction<"processAutomaticBrowsingSettings">,
        },
      ],
    },
    {
      stepId: "2",
      kind: "action",
      actionDefinitionId: "persistEntities",
      description: "Save proposed entities to database",
      inputSources: [
        {
          inputName:
            "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAiFlowAction<"inferEntitiesFromContent">,
        },
        {
          inputName:
            "draft" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "draft" satisfies OutputNameForAiFlowAction<"processAutomaticBrowsingSettings">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName:
        "persistedEntities" as const satisfies OutputNameForAiFlowAction<"persistEntities">,
      ...browserInferenceFlowOutput,
    },
  ],
};
