import { getRequiredEnv } from "./environment";

export const SYSTEM_ACCOUNT_SHORTNAME = getRequiredEnv(
  "SYSTEM_ACCOUNT_SHORTNAME",
);

export const SYSTEM_ACCOUNT_NAME = getRequiredEnv("SYSTEM_ACCOUNT_NAME");
