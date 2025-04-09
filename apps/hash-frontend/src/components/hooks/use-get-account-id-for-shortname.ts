import type { WebId } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { useMemo } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetWebIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; webId: WebId | undefined } => {
  const { loading: usersLoading, users } = useUsers();
  const { loading: orgsLoading, orgs } = useOrgs();

  const webId = useMemo(() => {
    /** @todo - don't do extract anymore */
    const userEntityId = users?.find((user) => user.shortname === shortname)
      ?.entity.metadata.recordId.entityId;

    const userWebId = userEntityId
      ? extractWebIdFromEntityId(userEntityId)
      : undefined;

    if (userWebId !== undefined) {
      return userWebId;
    }

    const orgEntityId = orgs?.find((org) => org.shortname === shortname)?.entity
      .metadata.recordId.entityId;
    const orgWebId = orgEntityId
      ? extractWebIdFromEntityId(orgEntityId)
      : undefined;

    if (orgWebId !== undefined) {
      return orgWebId;
    }
  }, [users, orgs, shortname]);

  return {
    loading: usersLoading || orgsLoading,
    webId,
  };
};
