import type {
  ActionDefinition,
  DeepReadOnly,
  TriggerDefinition,
} from "./types";

export const triggerDefinitions = {
  userTrigger: {
    kind: "trigger",
    name: "User Trigger",
  },
  userVisitedWebPageTrigger: {
    kind: "trigger",
    name: "User Visited Web Page Trigger",
    outputs: [
      {
        payloadKind: "WebPage",
        name: "visitedWebPage" as const,
        array: false,
      },
    ],
  },
} satisfies Record<string, TriggerDefinition>;

export const actionDefinitions = {
  generateWebQuery: {
    name: "Generate Web Query",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "prompt",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "query",
        array: false,
      },
    ],
  },
  webSearch: {
    name: "Web Search",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "query",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "WebPage",
        name: "webPage",
        array: true,
      },
    ],
  },
  inferEntitiesFromContent: {
    name: "Infer Entities From Content",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text", "WebPage"],
        name: "content",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds",
        required: true,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        array: true,
      },
    ],
  },
  persistEntity: {
    name: "Persist Entity",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["ProposedEntity"],
        name: "proposedEntity",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Entity",
        name: "persistedEntity",
        array: false,
      },
    ],
  },
} as const satisfies Record<string, DeepReadOnly<ActionDefinition>>;
