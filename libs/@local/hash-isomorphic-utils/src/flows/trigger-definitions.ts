import type { DeepReadOnly, TriggerDefinition } from "./types";

const triggerIds = [
  "userTrigger",
  "userVisitedWebPageTrigger",
  "scheduledTrigger",
] as const;

export type TriggerDefinitionId = (typeof triggerIds)[number];

const triggerDefinitionsAsConst = {
  userTrigger: {
    kind: "trigger",
    triggerDefinitionId: "userTrigger",
    name: "User Trigger",
  },
  userVisitedWebPageTrigger: {
    kind: "trigger",
    triggerDefinitionId: "userVisitedWebPageTrigger",
    name: "User Visited Web Page Trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "visitedWebPageUrl" as const,
        array: false,
      },
    ],
  },
  scheduledTrigger: {
    kind: "trigger",
    triggerDefinitionId: "scheduledTrigger",
    name: "Scheduled Trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "scheduledAtTime" as const,
        array: false,
      },
    ],
  },
} as const satisfies Record<
  TriggerDefinitionId,
  DeepReadOnly<TriggerDefinition>
>;

export type OutputNameForTrigger<
  T extends keyof typeof triggerDefinitionsAsConst,
> = (typeof triggerDefinitionsAsConst)[T] extends {
  outputs: { name: string }[];
}
  ? (typeof triggerDefinitionsAsConst)[T]["outputs"][number]["name"]
  : never;

export const triggerDefinitions =
  triggerDefinitionsAsConst as unknown as Record<
    TriggerDefinitionId,
    TriggerDefinition
  >;
