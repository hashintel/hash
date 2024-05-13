import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityUuid } from "@local/hash-subgraph";

export const manualBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Entity research triggered manually from browser",
  flowDefinitionId: "manual-browser-inference" as EntityUuid,
  description: "Find entities of the requested types in a web page",
  trigger: {
    kind: "trigger",
    description: "Triggered manually by user for a specific web page",
    triggerDefinitionId: "userTrigger",
    outputs: [
      {
        payloadKind: "WebPage",
        description: "The web page to be analyzed",
        name: "visitedWebPage",
        array: false,
        required: true,
      },
      {
        payloadKind: "VersionedUrl",
        description: "The ids of the entity types to create entities of",
        name: "entityTypeIds",
        array: true,
        required: true,
      },
      {
        payloadKind: "Text",
        description: "The model to use for inference",
        name: "model",
        array: true,
        required: true,
      },
      {
        payloadKind: "Boolean",
        description: "Whether the entities should be created as drafts or not",
        name: "draft",
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
          sourceStepOutputName: "webPage",
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "entityTypeIds",
        },
        {
          inputName:
            "model" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "model",
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
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "draft",
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "1",
      stepOutputName: "persistedEntities",
      name: "persistedEntities" as const,
      payloadKind: "PersistedEntity",
      array: true,
      required: true,
    },
  ],
};

export const automaticBrowserInferenceFlowDefinition: FlowDefinition = {
  name: "Entity research triggered automatically from browser",
  flowDefinitionId: "automatic-browser-inference" as EntityUuid,
  description:
    "Find entities in a web page according to the user's automatic browsing settings",
  trigger: {
    kind: "trigger",
    description: "Triggered automatically when the user visited a web page",
    triggerDefinitionId: "userVisitedWebPageTrigger",
    outputs: [
      {
        payloadKind: "WebPage",
        description: "The web page visited",
        name: "visitedWebPage",
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
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "webPage",
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
          sourceStepOutputName: "webPage",
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
      stepOutputName: "persistedEntities",
      name: "persistedEntities" as const,
      payloadKind: "PersistedEntity",
      array: true,
      required: true,
    },
  ],
};
