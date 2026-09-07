/**
 * GitHub's return leg: verifies the handshake, exchanges the code, sets the session.
 */

import { createPetrinautAuthHandlers } from "../../src/server/auth/petrinaut-auth";

declare const process: {
  env: Record<string, string | undefined>;
};

export default {
  fetch: createPetrinautAuthHandlers(process.env).callback,
};
