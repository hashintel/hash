import type { GraphApi } from "@local/hash-graph-client";
import type {
  Policy,
  PolicyFilter,
} from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

export const findPolicies = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  filter: PolicyFilter,
): Promise<Policy[]> =>
  graphAPI
    .getPolicies(authentication.actorId, filter)
    .then(({ data: policies }) => policies as Policy[]);
