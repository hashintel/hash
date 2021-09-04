export const SYSTEM_TYPES = [
  "Block",
  "EntityType",
  "Org",
  "Page",
  "Text",
  "User",
] as const;

export type SystemType = typeof SYSTEM_TYPES[number];
