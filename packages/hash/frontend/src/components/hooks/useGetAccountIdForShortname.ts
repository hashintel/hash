import { useMemo } from "react";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { useUsers } from "./useUsers";
import { useOrgs } from "./useOrgs";

export const useGetAccountIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; accountId: string | undefined } => {
  const { loading: usersLoading, users } = useUsers(true);
  const { loading: orgsLoading, orgs } = useOrgs(true);

  const accountId = useMemo(() => {
    /** @todo - don't do extract anymore */
    const userBaseId = users?.find((user) => user.shortname === shortname)
      ?.entityEditionId.baseId;
    const userAccountId = userBaseId
      ? extractEntityUuidFromEntityId(userBaseId)
      : undefined;

    if (userAccountId !== undefined) {
      return userAccountId;
    }

    const orgBaseId = orgs?.find((org) => org.shortname === shortname)
      ?.entityEditionId.baseId;
    const orgAccountId = orgBaseId
      ? extractEntityUuidFromEntityId(orgBaseId)
      : undefined;

    if (orgAccountId !== undefined) {
      return orgAccountId;
    }
  }, [users, orgs, shortname]);

  return {
    loading: usersLoading || orgsLoading,
    accountId,
  };
};
