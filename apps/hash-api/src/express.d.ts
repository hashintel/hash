import { Session } from "@ory/client";

import { ImpureGraphContext } from "./graph/context-types";
import { User } from "./graph/knowledge/system-types/user";

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
