import { useMemo } from "react";
import {
  AccountId,
  extractAccountIdAsEntityUuid,
} from "@hashintel/hash-shared/types";

import { useUsers } from "./useUsers";
import { useOrgs } from "./useOrgs";

export const useGetAccountIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; accountId: AccountId | undefined } => {
  const { loading: usersLoading, users } = useUsers(true);
  const { loading: orgsLoading, orgs } = useOrgs(true);

  const accountId = useMemo(() => {
    /** @todo - don't do extract anymore */
    const userBaseId = users?.find((user) => user.shortname === shortname)
      ?.entityEditionId.baseId;
    const userAccountId = userBaseId
      ? extractAccountIdAsEntityUuid(userBaseId)
      : undefined;

    if (userAccountId !== undefined) {
      return userAccountId;
    }

    const orgBaseId = orgs?.find((org) => org.shortname === shortname)
      ?.entityEditionId.baseId;
    const orgAccountId = orgBaseId
      ? extractAccountIdAsEntityUuid(orgBaseId)
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
