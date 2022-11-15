import { getRequiredEnv } from "./environment";

/** @todo - This shouldn't be set via an env-var. We should be resolving this as necessary through the model classes */
export const SYSTEM_ACCOUNT_SHORTNAME = getRequiredEnv(
  "SYSTEM_ACCOUNT_SHORTNAME",
);

export const SYSTEM_ACCOUNT_NAME = getRequiredEnv("SYSTEM_ACCOUNT_NAME");
