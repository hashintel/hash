/**
 * Mints a short-lived, audience-scoped token for a service on another origin.
 */

import { createPetrinautAuthHandlers } from "../../src/server/auth/petrinaut-auth";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createPetrinautAuthHandlers(process.env).delegatedToken,
};
