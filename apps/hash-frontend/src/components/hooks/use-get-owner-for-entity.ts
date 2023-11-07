import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetOwnerForEntity = () => {
  /*
   * This is a simple way of getting all users and orgs to find an entity's owner's name
   */
  const { users = [] } = useUsers();
  const { orgs = [] } = useOrgs();

  return useCallback(
    (entity: Entity) => {
      const ownedById = extractOwnedByIdFromEntityId(
        entity.metadata.recordId.entityId,
      );

      const owner =
        users.find((user) => ownedById === user.accountId) ??
        orgs.find((org) => ownedById === org.accountGroupId);

      if (!owner) {
        // The HASH Instance is owned by an account group without an org
        if (
          entity.metadata.entityTypeId ===
          systemTypes.entityType.hashInstance.entityTypeId
        ) {
          return {
            ownedById,
            // This will create a link to an entity page that doesn't actually work. @todo decide what to do about this
            shortname: "system",
          };
        }

        throw new Error(
          `Owner with accountId ${ownedById} not found – possibly a caching issue if it has been created mid-session`,
        );
      }

      return {
        ownedById,
        shortname: owner.shortname ?? "incomplete-user-account",
      };
    },
    [orgs, users],
  );
};
