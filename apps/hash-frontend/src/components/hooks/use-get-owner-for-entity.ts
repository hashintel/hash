import {
  Entity,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph/main";
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
      const ownerUuid = extractOwnedByIdFromEntityId(
        entity.metadata.recordId.entityId,
      );

      const owner =
        users.find((user) => ownerUuid === user.accountId) ??
        orgs.find((org) => ownerUuid === org.accountId);

      if (!owner) {
        throw new Error(
          `Owner with accountId ${ownerUuid} not found – possibly a caching issue if it has been created mid-session`,
        );
      }

      const isUser = "userAccountId" in owner;

      return {
        accountId: isUser ? owner.userAccountId : owner.accountId,
        shortname: owner.shortname ?? "incomplete-user-account",
      };
    },
    [orgs, users],
  );
};
