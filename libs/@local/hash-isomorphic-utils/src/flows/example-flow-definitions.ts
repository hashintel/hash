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
      definition: actionDefinitions.generateWebQuery,
      inputSources: [
        {
          inputName: "prompt" satisfies InputNameForAction<"generateWebQuery">,
          kind: "step-output",
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
      definition: actionDefinitions.webSearch,
      inputSources: [
        {
          inputName: "query" satisfies InputNameForAction<"webSearch">,
          kind: "step-output",
          sourceNodeId: "0",
          sourceNodeOutputName:
            "query" satisfies OutputNameForAction<"generateWebQuery">,
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
          sourceNodeId: "1",
          sourceNodeOutputName:
            "webPage" satisfies OutputNameForAction<"webSearch">,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
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
      nodeId: "3",
      definition: actionDefinitions.persistEntity,
      inputSources: [
        {
          inputName:
            "proposedEntity" satisfies InputNameForAction<"persistEntity">,
          kind: "step-output",
          sourceNodeId: "2",
          sourceNodeOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
        },
      ],
    },
  ],
};

export const inferUserEntitiesFromWebPageFlowDefinition: FlowDefinition = {
  name: "Infer User Entities from Web Page Flow",
  trigger: {
    definition: triggerDefinitions.userVisitedWebPageTrigger,
  },
  nodes: [
    {
      nodeId: "0",
      definition: actionDefinitions.getWebPageByUrl,
      inputSources: [
        {
          inputName: "url" satisfies InputNameForAction<"getWebPageByUrl">,
          kind: "step-output",
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
      definition: actionDefinitions.inferEntitiesFromContent,
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
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
            value: systemEntityTypes.user.entityTypeId,
          },
        },
      ],
    },
    {
      nodeId: "2",
      definition: actionDefinitions.persistEntity,
      inputSources: [
        {
          inputName:
            "proposedEntity" satisfies InputNameForAction<"persistEntity">,
          kind: "step-output",
          sourceNodeId: "1",
          sourceNodeOutputName:
            "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
        },
      ],
    },
  ],
};
