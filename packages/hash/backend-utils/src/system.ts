import { getRequiredEnv } from "./environment";

export const WORKSPACE_ACCOUNT_SHORTNAME = getRequiredEnv(
  "WORKSPACE_ACCOUNT_SHORTNAME",
);

export const WORKSPACE_ACCOUNT_NAME = getRequiredEnv("WORKSPACE_ACCOUNT_NAME");
