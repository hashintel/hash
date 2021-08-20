export const SYSTEM_TYPES = ["Block", "Org", "Page", "Text", "User"] as const;

export type SystemType = typeof SYSTEM_TYPES[number];
