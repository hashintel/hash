import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/step-definitions";
import {
  actionDefinitions,
  triggerDefinitions,
} from "@local/hash-isomorphic-utils/flows/step-definitions";

export const dummyFlows: FlowDefinition[] = [
  {
    name: "Parallel dependencies",
    trigger: {
      kind: "trigger",
      definition: triggerDefinitions.userTrigger,
      outputs: [
        {
          payloadKind: "Text",
          name: "prompt",
          array: false,
        },
        {
          payloadKind: "Text",
          name: "entityTypes",
          array: false,
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
            inputName:
              "prompt" satisfies InputNameForAction<"generateWebQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "prompt",
          },
        ],
      },
      {
        stepId: "1",
        kind: "action",
        actionDefinition: actionDefinitions.webSearch,
        inputSources: [
          {
            inputName:
              "prompt" satisfies InputNameForAction<"generateWebQuery">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "prompt",
          },
        ],
      },
      {
        stepId: "2",
        kind: "action",
        actionDefinition: actionDefinitions.inferEntitiesFromContent,
        inputSources: [
          {
            inputName:
              "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "0",
            sourceStepOutputName:
              "webPage" satisfies OutputNameForAction<"webSearch">,
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName: "entityTypeIds",
          },
        ],
      },
      {
        stepId: "3",
        kind: "action",
        actionDefinition: actionDefinitions.inferEntitiesFromContent,
        inputSources: [
          {
            inputName:
              "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "0",
            sourceStepOutputName:
              "webPage" satisfies OutputNameForAction<"webSearch">,
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "entityTypes",
          },
        ],
      },
    ],
  },
];
