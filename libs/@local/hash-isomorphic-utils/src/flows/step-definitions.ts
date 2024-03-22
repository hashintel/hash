import type { ActionDefinition, TriggerDefinition } from "./types";

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
        name: "prompt" as const,
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "query" as const,
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
        name: "query" as const,
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "WebPage",
        name: "webPage" as const,
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
        name: "content" as const,
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds" as const,
        required: true,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities" as const,
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
        name: "proposedEntity" as const,
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Entity",
        name: "persistedEntity" as const,
        array: false,
      },
    ],
  },
} satisfies Record<string, ActionDefinition>;
