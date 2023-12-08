import { systemTypeWebShortnames } from "@local/hash-isomorphic-utils/ontology-types";

export const machineActorIdentifiers = [
  ...systemTypeWebShortnames,
  "ai-assistant",
] as const;

export type MachineActorIdentifier = (typeof machineActorIdentifiers)[number];
