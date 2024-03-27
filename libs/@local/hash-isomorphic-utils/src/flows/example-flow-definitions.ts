import { systemEntityTypes } from "../ontology-type-ids";
import type {
  InputNameForAction,
  OutputNameForAction,
  OutputNameForTrigger,
} from "./step-definitions";
import { actionDefinitions, triggerDefinitions } from "./step-definitions";
import type { FlowDefinition } from "./types";

export const researchTaskFlowDefinition: FlowDefinition = {
  name: "Research Task",
  trigger: {
    definition: triggerDefinitions.userTrigger,
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "prompt" as const,
        array: false,
      },
      {
        payloadKind: "VersionedUrl",
        name: "entityTypeIds",
        array: true,
      },
    ],
  },
  steps: [
    {
      stepId: "0",
      kind: "action",
      actionDefinition: actionDefinitions.generateWebQuery,
      inputSources: [
        {
          inputName: "prompt" satisfies InputNameForAction<"generateWebQuery">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "prompt",
          // kind: "hardcoded",
          // value: {
          //   kind: "Text",
          //   value: "Get board members of Apple Inc.",
          // },
        },
      ],
    },
    {
      stepId: "1",
      kind: "action",
      actionDefinition: actionDefinitions.webSearch,
      inputSources: [
        {
          inputName: "query" satisfies InputNameForAction<"webSearch">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "query" satisfies OutputNameForAction<"generateWebQuery">,
        },
      ],
    },
    {
      stepId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "webSearchResults",
        kind: "step-output",
        sourceStepId: "1",
        sourceStepOutputName:
          "webPage" satisfies OutputNameForAction<"webSearch">,
      },
      steps: [
        {
          stepId: "2.1",
          kind: "action",
          actionDefinition: actionDefinitions.inferEntitiesFromContent,
          inputSources: [
            {
              inputName:
                "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
              kind: "parallel-group-input",
            },
            {
              inputName:
                "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
              kind: "step-output",
              sourceStepId: "trigger",
              sourceStepOutputName: "entityTypeIds",
              // kind: "hardcoded",
              // value: {
              //   kind: "VersionedUrl",
              //   /** @todo: use a different type here */
              //   value: systemEntityTypes.user.entityTypeId,
              // },
            },
          ],
        },
        {
          stepId: "2.2",
          actionDefinition: actionDefinitions.persistEntity,
          kind: "action",
          inputSources: [
            {
              inputName:
                "proposedEntity" satisfies InputNameForAction<"persistEntity">,
              kind: "step-output",
              sourceStepId: "2.1",
              sourceStepOutputName:
                "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
            },
          ],
        },
      ],
      aggregateOutput: {
        stepId: "2.2",
        stepOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName:
        "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
      name: "persistedEntities" as const,
      payloadKind: "Entity",
      array: true,
    },
  ],
};

export const inferUserEntitiesFromWebPageFlowDefinition: FlowDefinition = {
  name: "Infer User Entities from Web Page Flow",
  trigger: {
    kind: "trigger",
    definition: triggerDefinitions.userVisitedWebPageTrigger,
  },
  steps: [
    {
      stepId: "0",
      kind: "action",
      actionDefinition: actionDefinitions.getWebPageByUrl,
      inputSources: [
        {
          inputName: "url" satisfies InputNameForAction<"getWebPageByUrl">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "visitedWebPageUrl" satisfies OutputNameForTrigger<"userVisitedWebPageTrigger">,
          // kind: "hardcoded",
          // value: {
          //   kind: "Text",
          //   value: "https://example.com",
          // },
        },
      ],
    },
    {
      stepId: "1",
      kind: "action",
      actionDefinition: actionDefinitions.inferEntitiesFromContent,
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "webPage" satisfies OutputNameForAction<"getWebPageByUrl">,
          // kind: "hardcoded",
          // value: {
          //   kind: "WebPage",
          //   value: {
          //     url: "https://example.com",
          //     title: "Example web page",
          //     textContent:
          //       "This is an example web page about Bob, who is a software engineer at Apple Inc.",
          //   },
          // },
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "hardcoded",
          value: {
            kind: "VersionedUrl",
            value: [systemEntityTypes.user.entityTypeId],
          },
        },
      ],
    },
    {
      stepId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "proposedEntities",
        kind: "step-output",
        sourceStepId: "1",
        sourceStepOutputName:
          "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
      },
      steps: [
        {
          stepId: "2.0",
          kind: "action",
          actionDefinition: actionDefinitions.persistEntity,
          inputSources: [
            {
              inputName:
                "proposedEntity" satisfies InputNameForAction<"persistEntity">,
              kind: "parallel-group-input",
            },
          ],
        },
      ],
      aggregateOutput: {
        stepId: "2.0",
        stepOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName:
        "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
      name: "persistedEntities" as const,
      payloadKind: "Entity",
      array: true,
    },
  ],
};
