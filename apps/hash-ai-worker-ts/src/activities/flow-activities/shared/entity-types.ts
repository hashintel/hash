import {
  type VersionedUrl,
  validateVersionedUrl,
} from "@blockprotocol/type-system";
import { hasPermissionForEntityTypes } from "@local/hash-graph-sdk/entity-type";

import { graphApiClient } from "../../shared/graph-api-client.js";

import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

/** Checks the entity type IDs an entity is given, returning why they're invalid. */
export const validateEntityTypeIds = (
  entityTypeIds: VersionedUrl[],
): string | undefined => {
  if (entityTypeIds.length === 0) {
    return "Give at least one entity type ID.";
  }

  for (const entityTypeId of entityTypeIds) {
    if (validateVersionedUrl(entityTypeId).type !== "Ok") {
      return `${JSON.stringify(entityTypeId)} is not an entity type ID.`;
    }
  }

  return undefined;
};

/**
 * The web's machine saves entities, and may instantiate types the user can't, so the user's own permission to
 * instantiate each type, and the types it inherits from, is checked before it does. Returns why the user can't.
 */
export const checkUserCanInstantiate = async (
  authentication: AuthenticationContext,
  entityTypeIds: VersionedUrl[],
): Promise<string | undefined> => {
  if (entityTypeIds.length === 0) {
    return undefined;
  }

  const instantiableEntityTypeIds = new Set(
    await hasPermissionForEntityTypes(graphApiClient, authentication, {
      entityTypeIds,
      action: "instantiate",
    }),
  );

  const forbiddenEntityTypeIds = entityTypeIds.filter(
    (entityTypeId) => !instantiableEntityTypeIds.has(entityTypeId),
  );

  if (forbiddenEntityTypeIds.length === 0) {
    return undefined;
  }

  return forbiddenEntityTypeIds.length === 1
    ? `Entity type ${forbiddenEntityTypeIds[0]} doesn't exist or can't be instantiated by the user running the flow.`
    : `Entity types ${forbiddenEntityTypeIds.join(", ")} don't exist or can't be instantiated by the user running the flow.`;
};
