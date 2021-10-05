export const SYSTEM_TYPES = [
  "Block",
  "EntityType",
  "Org",
  "Page",
  "Text",
  "User",
] as const;

export type SystemType = typeof SYSTEM_TYPES[number];

export const isSystemType = (val: string): val is SystemType => {
  return SYSTEM_TYPES.includes(val as any);
};
