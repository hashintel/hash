import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { Session } from "@ory/client";

import type { ImpureGraphContext } from "./graph/context-types.js";
import type { User } from "./graph/knowledge/system-types/user.js";

declare global {
  namespace Express {
    interface Request {
      context: ImpureGraphContext<true, true> & {
        vaultClient?: VaultClient;
      };
      session: Session | undefined;
      user: User | undefined;
    }
  }
}
