import type { Entity } from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetOwnerForEntity = () => {
  /*
   * This is a simple way of getting all users and orgs to find an entity's owner's name
   */
  const { users = [], loading: usersLoading } = useUsers();
  const { orgs = [], loading: orgsLoading } = useOrgs();

  const loading = usersLoading || orgsLoading;

  return useCallback(
    (entity: Entity) => {
      const ownedById = extractOwnedByIdFromEntityId(
        entity.metadata.recordId.entityId,
      );

      if (loading) {
        return {
          ownedById,
          shortname: "",
        };
      }

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
    [loading, orgs, users],
  );
};
