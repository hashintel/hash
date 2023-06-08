import {
  AccountEntityId,
  AccountId,
  extractAccountId,
} from "@local/hash-subgraph";
import { useMemo } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useGetAccountIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; accountId: AccountId | undefined } => {
  const { loading: usersLoading, users } = useUsers(true);
  const { loading: orgsLoading, orgs } = useOrgs(true);

  const accountId = useMemo(() => {
    /** @todo - don't do extract anymore */
    const userBaseId = users?.find((user) => user.shortname === shortname)
      ?.entityRecordId.entityId;
    const userAccountId = userBaseId
      ? extractAccountId(userBaseId as AccountEntityId)
      : undefined;

    if (userAccountId !== undefined) {
      return userAccountId;
    }

    const orgBaseId = orgs?.find((org) => org.shortname === shortname)
      ?.entityRecordId.entityId;
    const orgAccountId = orgBaseId
      ? extractAccountId(orgBaseId as AccountEntityId)
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
