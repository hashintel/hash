import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  AutomaticInferenceTriggerInputName,
  AutomaticInferenceTriggerInputs,
  ManualInferenceTriggerInputName,
  ManualInferenceTriggerInputs,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import { browserInferenceFlowOutput } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityUuid } from "@local/hash-subgraph";

export const manualBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Research triggered manually from browser",
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
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPage" satisfies ManualInferenceTriggerInputName,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "entityTypeIds" satisfies ManualInferenceTriggerInputName,
        },
        {
          inputName:
            "model" satisfies InputNameForAction<"inferEntitiesFromContent">,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
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
        "persistedEntities" as const satisfies OutputNameForAction<"persistEntities">,
      ...browserInferenceFlowOutput,
    },
  ],
};

export const automaticBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Research triggered automatically from browser",
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
            "webPage" satisfies InputNameForAction<"processAutomaticBrowsingSettings">,
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
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPage" satisfies AutomaticInferenceTriggerInputName,
        },
        {
          inputName:
            "model" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "model" satisfies OutputNameForAction<"processAutomaticBrowsingSettings">,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "entityTypeIds" satisfies OutputNameForAction<"processAutomaticBrowsingSettings">,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "draft" satisfies OutputNameForAction<"processAutomaticBrowsingSettings">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName:
        "persistedEntities" as const satisfies OutputNameForAction<"persistEntities">,
      ...browserInferenceFlowOutput,
    },
  ],
};
