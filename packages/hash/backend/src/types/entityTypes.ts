export const PossibleEntities = [
  "EntityType",
  "Page",
  "Text",
  "UnknownEntity",
] as const;

export type PossibleEntity = typeof PossibleEntities[number];
