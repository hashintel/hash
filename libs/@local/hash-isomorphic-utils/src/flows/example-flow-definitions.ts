import { systemEntityTypes } from "../ontology-type-ids";
import type {
  InputNameForAction,
  OutputNameForAction,
  OutputNameForTrigger,
} from "./node-definitions";
import { actionDefinitions, triggerDefinitions } from "./node-definitions";
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
  nodes: [
    {
      nodeId: "0",
      kind: "action",
      actionDefinition: actionDefinitions.generateWebQuery,
      inputSources: [
        {
          inputName: "prompt" satisfies InputNameForAction<"generateWebQuery">,
          kind: "node-output",
          sourceNodeId: "trigger",
          sourceNodeOutputName: "prompt",
          // kind: "hardcoded",
          // value: {
          //   kind: "Text",
          //   value: "Get board members of Apple Inc.",
          // },
        },
      ],
    },
    {
      nodeId: "1",
      kind: "action",
      actionDefinition: actionDefinitions.webSearch,
      inputSources: [
        {
          inputName: "query" satisfies InputNameForAction<"webSearch">,
          kind: "node-output",
          sourceNodeId: "0",
          sourceNodeOutputName:
            "query" satisfies OutputNameForAction<"generateWebQuery">,
        },
      ],
    },
    {
      nodeId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "webSearchResults",
        kind: "node-output",
        sourceNodeId: "1",
        sourceNodeOutputName:
          "webPage" satisfies OutputNameForAction<"webSearch">,
      },
      nodes: [
        {
          nodeId: "2.1",
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
              kind: "node-output",
              sourceNodeId: "trigger",
              sourceNodeOutputName: "entityTypeIds",
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
          nodeId: "2.2",
          actionDefinition: actionDefinitions.persistEntity,
          kind: "action",
          inputSources: [
            {
              inputName:
                "proposedEntity" satisfies InputNameForAction<"persistEntity">,
              kind: "node-output",
              sourceNodeId: "2.1",
              sourceNodeOutputName:
                "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
            },
          ],
        },
      ],
      aggregateOutput: {
        nodeId: "2.2",
        nodeOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
};

export const inferUserEntitiesFromWebPageFlowDefinition: FlowDefinition = {
  name: "Infer User Entities from Web Page Flow",
  trigger: {
    kind: "trigger",
    definition: triggerDefinitions.userVisitedWebPageTrigger,
  },
  nodes: [
    {
      nodeId: "0",
      kind: "action",
      actionDefinition: actionDefinitions.getWebPageByUrl,
      inputSources: [
        {
          inputName: "url" satisfies InputNameForAction<"getWebPageByUrl">,
          kind: "node-output",
          sourceNodeId: "trigger",
          sourceNodeOutputName:
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
      nodeId: "1",
      kind: "action",
      actionDefinition: actionDefinitions.inferEntitiesFromContent,
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "node-output",
          sourceNodeId: "0",
          sourceNodeOutputName:
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
      nodeId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "proposedEntities",
        kind: "node-output",
        sourceNodeId: "1",
        sourceNodeOutputName:
          "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
      },
      nodes: [
        {
          nodeId: "2.0",
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
        nodeId: "2.0",
        nodeOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
};
