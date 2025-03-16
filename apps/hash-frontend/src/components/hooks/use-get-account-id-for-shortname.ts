import type { OwnedById } from "@blockprotocol/type-system";
import { extractOwnedByIdFromEntityId } from "@blockprotocol/type-system";
import { useMemo } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetOwnedByIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; ownedById: OwnedById | undefined } => {
  const { loading: usersLoading, users } = useUsers();
  const { loading: orgsLoading, orgs } = useOrgs();

  const ownedById = useMemo(() => {
    /** @todo - don't do extract anymore */
    const userEntityId = users?.find((user) => user.shortname === shortname)
      ?.entity.metadata.recordId.entityId;

    const userOwnedById = userEntityId
      ? extractOwnedByIdFromEntityId(userEntityId)
      : undefined;

    if (userOwnedById !== undefined) {
      return userOwnedById;
    }

    const orgEntityId = orgs?.find((org) => org.shortname === shortname)?.entity
      .metadata.recordId.entityId;
    const orgOwnedById = orgEntityId
      ? extractOwnedByIdFromEntityId(orgEntityId)
      : undefined;

    if (orgOwnedById !== undefined) {
      return orgOwnedById;
    }
  }, [users, orgs, shortname]);

  return {
    loading: usersLoading || orgsLoading,
    ownedById,
  };
};
