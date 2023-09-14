import { OwnedById } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useWorkspaceShortnameByOwnedById = (params: {
  ownedById: OwnedById;
}) => {
  const { ownedById } = params;
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
        orgs?.find((org) => org.accountGroupId === ownedById) ??
        users?.find((user) => user.accountId === ownedById)
      )?.shortname,
    [users, orgs, ownedById],
  );

  return { shortname, loading: loadingUsers || loadingOrgs };
};
