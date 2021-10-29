export const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || "localhost:3000";

export const FRONTEND_URL = `http${
  process.env.HTTPS_ENABLED ? "s" : ""
}://${FRONTEND_DOMAIN}`;

export const SYSTEM_ACCOUNT_SHORTNAME = "hash";
export const SYSTEM_ACCOUNT_NAME = "HASH";
export const SYSTEM_TYPES = [
  "Block",
  "EntityType",
  "Org",
  "Page",
  "Text",
  "User",
  "File",
  "OrgInvitationLink",
  "OrgEmailInvitation",
] as const;
export type SYSTEM_TYPE = typeof SYSTEM_TYPES[number];
