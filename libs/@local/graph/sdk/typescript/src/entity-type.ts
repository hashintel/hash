import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

import type { AuthenticationContext } from "./authentication-context.js";

/**
 * Returns whether the user can instantiate the given entity types.
 *
 * The returned array has the same length and order as the input array of `entityTypeIds`.
 * Each boolean value at index `i` indicates whether the user is permitted to instantiate the
 * entity type at `entityTypeIds[i]`.
 */
export const canInstantiateEntityTypes = <
  T extends readonly [VersionedUrl, ...VersionedUrl[]],
>(
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  entityTypeIds: T,
): Promise<{ [K in keyof T]: boolean }> =>
  graphAPI
    .canInstantiateEntityTypes(
      authentication.actorId,
      entityTypeIds as unknown as VersionedUrl[],
    )
    .then(({ data: permitted }) => permitted as { [K in keyof T]: boolean });
