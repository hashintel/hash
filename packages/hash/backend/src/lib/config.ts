import { getRequiredEnv } from "../util";

const NODE_ENV = getRequiredEnv("NODE_ENV");
const PORT = process.env.PORT;

/** Whether the backend is running in the test environment. */
export const isTestEnv = NODE_ENV === "test";

/** Whether the backend is running in the development environment. */
export const isDevEnv = NODE_ENV === "development";

/** Whether the backend is running in the production environment. */
export const isProdEnv = NODE_ENV === "production";

/** The port the backend server should be running on */
export const port = PORT ? parseInt(PORT, 10) : 5001;

/** Whether the StatsD client is enabled */
export const isStatsDEnabled = process.env.STATSD_ENABLED === "1";

export const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN;

if (!FRONTEND_DOMAIN) {
  throw new Error(`environment variable FRONTEND_DOMAIN is required`);
}

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
];
