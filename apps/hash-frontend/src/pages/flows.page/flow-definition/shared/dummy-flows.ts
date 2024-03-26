import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import {
  actionDefinitions,
  InputNameForAction,
  OutputNameForAction,
  triggerDefinitions,
} from "@local/hash-isomorphic-utils/flows/step-definitions";

export const dummyFlows: FlowDefinition[] = [
  {
    name: "Parallel dependencies",
    trigger: {
      definition: triggerDefinitions.userTrigger,
      outputs: [
        {
          payloadKind: "Text",
          name: "prompt",
          array: false,
        },
      ],
    },
    nodes: [
      {
        nodeId: "0",
        definition: actionDefinitions.generateWebQuery,
        inputSources: [
          {
            inputName:
              "prompt" satisfies InputNameForAction<"generateWebQuery">,
            kind: "step-output",
            sourceNodeId: "trigger",
            sourceNodeOutputName: "prompt",
          },
        ],
      },
      {
        nodeId: "1",
        definition: actionDefinitions.webSearch,
        inputSources: [
          {
            inputName:
              "prompt" satisfies InputNameForAction<"generateWebQuery">,
            kind: "step-output",
            sourceNodeId: "trigger",
            sourceNodeOutputName: "prompt",
          },
        ],
      },
      {
        nodeId: "2",
        definition: actionDefinitions.inferEntitiesFromContent,
        inputSources: [
          {
            inputName:
              "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceNodeId: "0",
            sourceNodeOutputName:
              "webPage" satisfies OutputNameForAction<"webSearch">,
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceNodeId: "1",
            sourceNodeOutputName: "entityTypeIds",
          },
        ],
      },
      {
        nodeId: "3",
        definition: actionDefinitions.inferEntitiesFromContent,
        inputSources: [
          {
            inputName:
              "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceNodeId: "0",
            sourceNodeOutputName:
              "webPage" satisfies OutputNameForAction<"webSearch">,
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceNodeId: "1",
            sourceNodeOutputName: "entityTypeIds",
          },
        ],
      },
    ],
  },
];
