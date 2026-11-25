import { actorHeaders } from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";
import type { Ai, Machine } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

export const getMachineByIdentifier = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  identifier: string,
): Promise<Machine | null> =>
  graphAPI
    .getMachineByIdentifier(identifier, actorHeaders(authentication.actorId))
    .then((data) => {
      const machine = data as Machine | null;
      if (!machine) {
        return null;
      }
      return machine;
    });

export const getAiByIdentifier = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  identifier: string,
): Promise<Ai | null> =>
  graphAPI
    .getAiByIdentifier(identifier, actorHeaders(authentication.actorId))
    .then((data) => {
      const ai = data as Ai | null;
      if (!ai) {
        return null;
      }
      return ai;
    });
