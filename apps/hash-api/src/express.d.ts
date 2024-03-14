import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { Session } from "@ory/client";

import type { ImpureGraphContext } from "./graph/context-types";
import type { User } from "./graph/knowledge/system-types/user";

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
