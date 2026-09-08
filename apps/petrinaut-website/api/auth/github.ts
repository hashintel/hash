/**
 * Starts a GitHub sign-in: redirects to GitHub with a fresh state and PKCE challenge.
 */

import { createPetrinautAuthHandlers } from "../../src/server/auth/petrinaut-auth";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createPetrinautAuthHandlers(process.env).start,
};
