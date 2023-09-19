import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetOwnerForEntity = () => {
  /*
   * This is a simple way of getting all users and orgs to find an entity's owner's name
   * @todo rethink caching here – users and orgs added since session start won't appear
   * @todo probably replace this with something like fetching owners individually instead
   */
  const { users = [] } = useUsers(true);
  const { orgs = [] } = useOrgs(true);

  return useCallback(
    (entity: Entity) => {
      const ownedById = extractOwnedByIdFromEntityId(
        entity.metadata.recordId.entityId,
      );

      const owner =
        users.find((user) => ownedById === user.accountId) ??
        orgs.find((org) => ownedById === org.accountGroupId);

      if (!owner) {
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
