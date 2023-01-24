import { useMemo } from "react";

import { Org, User } from "../../lib/user-and-org";
import { useOrgs } from "./use-orgs";
import { useUsers } from "./use-users";

export const useWorkspaceByShortname = (
  shortname?: string,
): { workspace?: User | Org; loading: boolean } => {
  /**
   * @todo: getting an org or user by their shortname should not be happening
   * client side. This could be addressed by exposing structural querying
   * to the frontend.
   *
   * @see https://app.asana.com/0/1201095311341924/1202863271046362/f
   */
  const { users, loading: loadingUsers } = useUsers();
  const { orgs, loading: loadingOrgs } = useOrgs();

  const workspace = useMemo(
    () =>
      shortname
        ? [...(users ?? []), ...(orgs ?? [])].find(
            (userOrOrg) => userOrOrg.shortname === shortname,
          )
        : undefined,
    [shortname, users, orgs],
  );

  return { workspace, loading: loadingUsers || loadingOrgs };
};
