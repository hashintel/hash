import { useMemo } from "react";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { nilUuid } from "@hashintel/hash-shared/types";
import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-shared/environment";
import { useUsers } from "./useUsers";
import { useOrgs } from "./useOrgs";

export const useGetAccountIdForShortname = (
  shortname: string | undefined,
): { loading: boolean; accountId: string | undefined } => {
  const { loading: usersLoading, users } = useUsers();
  const { loading: orgsLoading, orgs } = useOrgs();

  const accountId = useMemo(() => {
    /**
     * @todo - This is incredibly flakey right now.
     *    We should be creating system types and entities under the actual org, _not_ the nilUuid
     */
    if (
      shortname === SYSTEM_ACCOUNT_SHORTNAME ||
      shortname === "example" // This is the root account
    ) {
      return nilUuid;
    }

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
