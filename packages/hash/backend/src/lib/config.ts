import { getRequiredEnv } from "../util";

export const FRONTEND_DOMAIN = getRequiredEnv("FRONTEND_DOMAIN");

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
  "OrgInvitationLink",
  "OrgEmailInvitation",
] as const;
