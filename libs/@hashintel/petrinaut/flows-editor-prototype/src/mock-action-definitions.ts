/**
 * MOCK: action definitions the editor needs that are not on `main`.
 *
 * - Read entity, Create entity, Update entity and Draft message are copied from open PRs (#10051, #10060, #10099).
 *   Delete each one when its PR merges, and import the real one from `engine.ts` instead.
 * - Send email has no PR and no spec yet. It only exists so the supplier review story can be drawn.
 *
 * Their shape mirrors the engine's `ActionDefinition`, with two differences the engine can't express on `main`:
 * ids outside `FlowActionDefinitionId`, and payload kinds the PRs add (`MockPayloadKind`).
 */
import type { PayloadKind } from "./engine";

/** Payload kinds the open PRs add to `PayloadKindValues`. */
export type MockPayloadKind =
  | "EntityProperty"
  | "PropertyObjectWithMetadata"
  | "PropertyPatch";

export const mockPayloadKinds: readonly MockPayloadKind[] = [
  "EntityProperty",
  "PropertyObjectWithMetadata",
  "PropertyPatch",
];

export type EditorPayloadKind = PayloadKind | MockPayloadKind;

export const isMockPayloadKind = (kind: string): kind is MockPayloadKind =>
  (mockPayloadKinds as readonly string[]).includes(kind);

export type MockInputDefinition = {
  name: string;
  description?: string;
  array: boolean;
  required: boolean;
  oneOfPayloadKinds: readonly EditorPayloadKind[];
  hasDefault?: boolean;
};

export type MockOutputDefinition = {
  name: string;
  description?: string;
  array: boolean;
  required: boolean;
} & (
  | { payloadKind: EditorPayloadKind }
  /** As in #10051: the kind a constant input declares (Read entity's `value` takes its `property`'s kind). */
  | { kindDeclaredBy: string; oneOfPayloadKinds: readonly EditorPayloadKind[] }
);

export type MockActionDefinition = {
  kind: "action";
  actionDefinitionId: MockActionDefinitionId;
  name: string;
  description: string;
  inputs: MockInputDefinition[];
  outputs: MockOutputDefinition[];
  origin: { kind: "open-pr"; pr: number } | { kind: "mock"; why: string };
};

export type MockActionDefinitionId =
  | "readEntity"
  | "createEntity"
  | "updateEntity"
  | "draftMessage"
  | "sendEmail";

export const readEntityKinds = [
  "Text",
  "Number",
  "Boolean",
  "Date",
] as const satisfies readonly PayloadKind[];

export const mockActionDefinitions: Record<
  MockActionDefinitionId,
  MockActionDefinition
> = {
  readEntity: {
    kind: "action",
    actionDefinitionId: "readEntity",
    name: "Read Entity",
    description:
      "Read one property of an entity as a plain value, e.g. a person's email address to send an email to.",
    origin: { kind: "open-pr", pr: 10051 },
    inputs: [
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "entityId",
        description:
          "The entity to read: the draft for an entity ID with a draft ID, otherwise the live entity.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["EntityProperty"],
        name: "property",
        description: `The property to read, and its kind: ${readEntityKinds.join(", ")}.`,
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        kindDeclaredBy: "property",
        oneOfPayloadKinds: readEntityKinds,
        name: "value",
        description:
          "The property's value, of the kind its input declares. Missing if the entity doesn't have the property.",
        array: false,
        required: false,
      },
    ],
  },
  createEntity: {
    kind: "action",
    actionDefinitionId: "createEntity",
    name: "Create Entity",
    description:
      "Create an entity of a type in the web the flow runs in, with values for some of its properties.",
    origin: { kind: "open-pr", pr: 10060 },
    inputs: [
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeId",
        description: "The type of the entity to create.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["PropertyObjectWithMetadata"],
        name: "properties",
        description:
          "The entity's properties with their metadata, as the graph takes them.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Boolean"],
        name: "draft",
        description:
          "Whether to create the entity as a draft, whose required properties can be left out.",
        required: false,
        hasDefault: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "EntityId",
        name: "entityId",
        description: "The new entity, with a draft ID if it's a draft.",
        array: false,
        required: true,
      },
    ],
  },
  updateEntity: {
    kind: "action",
    actionDefinitionId: "updateEntity",
    name: "Update Entity",
    description:
      "Set or remove some of the properties of an entity in the web the flow runs in, leaving its other properties as they are.",
    origin: { kind: "open-pr", pr: 10060 },
    inputs: [
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "entityId",
        description:
          "The entity to update: the draft for an entity ID with a draft ID, otherwise the live entity.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["PropertyPatch"],
        name: "propertyPatches",
        description:
          "The changes to make, in order, as the graph takes them. Added and replaced values give the ID of their data type.",
        required: true,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "EntityId",
        name: "entityId",
        description: "The entity updated: the same entity ID as given.",
        array: false,
        required: true,
      },
    ],
  },
  draftMessage: {
    kind: "action",
    actionDefinitionId: "draftMessage",
    name: "Draft Message",
    description:
      "Write a message, such as an email, with AI: a subject and a plain-text body, following instructions and using any context and entities given. Nothing is sent.",
    origin: { kind: "open-pr", pr: 10099 },
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "instructions",
        description:
          "What the message should say, who it's for, and its tone, e.g. 'Thank the customer for their order and confirm the delivery date'.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "context",
        description:
          "Text to draw on, e.g. a property read from an entity or an earlier step's summary.",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "entities",
        description:
          "Entities whose properties to draw on. At most 20, each in the web the flow runs in.",
        required: false,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "subject",
        description: "The message's subject line.",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "body",
        description:
          "The message's body, in plain text with line breaks: no HTML or Markdown.",
        array: false,
        required: true,
      },
    ],
  },
  sendEmail: {
    kind: "action",
    actionDefinitionId: "sendEmail",
    name: "Send Email",
    description: "Send an email. It only sends: drafting is a separate step.",
    origin: {
      kind: "mock",
      why: "No Send email action, PR or spec exists. Fields follow the PRD's Actions Priority row (to, subject, body).",
    },
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "to",
        description: "The addresses to send to.",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "subject",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "body",
        required: true,
        array: false,
      },
    ],
    outputs: [],
  },
};

export const isMockActionDefinitionId = (
  id: string,
): id is MockActionDefinitionId => Object.hasOwn(mockActionDefinitions, id);
