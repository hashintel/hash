import { getRequiredEnv } from "./environment";

/** @todo - This shouldn't be set via an env-var. We should be resolving this as necessary through the model classes */
export const WORKSPACE_ACCOUNT_SHORTNAME = getRequiredEnv(
  "WORKSPACE_ACCOUNT_SHORTNAME",
);

export const WORKSPACE_ACCOUNT_NAME = getRequiredEnv("WORKSPACE_ACCOUNT_NAME");
