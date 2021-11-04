import { getRequiredEnv } from "../util";

export const AWS_S3_BUCKET = getRequiredEnv("AWS_S3_UPLOADS_BUCKET");
export const AWS_REGION = getRequiredEnv("AWS_REGION");
export const AWS_S3_REGION = process.env.AWS_S3_REGION || AWS_REGION;

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
