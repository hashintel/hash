import type { Entity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetOwnerForEntity = () => {
  /*
   * This is a simple way of getting all users and orgs to find an entity's owner's name
   * This will not scale as it relies on all users and orgs being available in the frontend
   *
   * @todo H-2723 make it possible to request owners along with entities from the graph
   */
  const { users = [], loading: usersLoading } = useUsers();
  const { orgs = [], loading: orgsLoading } = useOrgs();

  const loading = usersLoading || orgsLoading;

  return useCallback(
    (params: { entity: Entity } | { ownedById: OwnedById }) => {
      const ownedById =
        "entity" in params
          ? extractOwnedByIdFromEntityId(
              params.entity.metadata.recordId.entityId,
            )
          : params.ownedById;

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
