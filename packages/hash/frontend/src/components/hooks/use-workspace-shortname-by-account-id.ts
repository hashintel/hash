import { useMemo } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useWorkspaceShortnameByAccountId = (params: {
  accountId: string;
}) => {
  const { accountId } = params;
  /**
   * @todo: getting an org or user by their account ID should not be happening
   * client side. This could be addressed by exposing structural querying
   * to the frontend.
   *
   * @see https://app.asana.com/0/1201095311341924/1202863271046362/f
   */
  const { users, loading: loadingUsers } = useUsers();
  const { orgs, loading: loadingOrgs } = useOrgs();

  const shortname = useMemo(
    () =>
      (
        orgs?.find((org) => org.accountId === accountId) ??
        users?.find((user) => user.accountId === accountId)
      )?.shortname,
    [users, orgs, accountId],
  );

  return { shortname, loading: loadingUsers || loadingOrgs };
};
