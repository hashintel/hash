/**
 * Reports the current session, and whether sign-in works on this deployment.
 */

import { createPetrinautAuthHandlers } from "../../src/server/auth/petrinaut-auth";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createPetrinautAuthHandlers(process.env).session,
};
