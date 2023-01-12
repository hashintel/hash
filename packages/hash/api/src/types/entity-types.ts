export const SYSTEM_TYPES = [
  "Block",
  "Comment",
  "EntityType",
  "Org",
  "Page",
  "Text",
  "User",
  "OrgMembership",
  "File",
  "OrgInvitationLink",
  "OrgEmailInvitation",
] as const;

export type SystemType = (typeof SYSTEM_TYPES)[number];

export const isSystemType = (val: string): val is SystemType => {
  return SYSTEM_TYPES.includes(val as any);
};
