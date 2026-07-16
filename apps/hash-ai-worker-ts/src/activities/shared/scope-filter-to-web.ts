import type { WebId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

/**
 * Restrict a graph entity filter to entities owned by the target web.
 *
 * The target web is enforced outside any caller-provided Boolean expression,
 * so an `any` branch in that expression cannot broaden the query to another
 * web the actor can access.
 */
export const scopeFilterToWeb = (filter: Filter, webId: WebId): Filter => ({
  all: [
    {
      equal: [{ path: ["webId"] }, { parameter: webId }],
    },
    filter,
  ],
});
