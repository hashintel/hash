import { useMemoCompare } from "../../../shared/use-memo-compare";
import { useAuthenticatedUser } from "../auth-info-context";

import type { InternalWeb } from "./header";
import type { WebId } from "@blockprotocol/type-system";

/**
 * The webs the user can filter by "membership": their own web plus each org
 * they belong to.
 *
 * The returned array keeps a stable identity across re-renders (and across
 * refetches of the authenticated user) for as long as its contents are
 * unchanged, so it is safe to use in dependency arrays.
 */
export const useInternalWebs = (): InternalWeb[] => {
  const { authenticatedUser } = useAuthenticatedUser();

  return useMemoCompare(
    () => {
      return [
        {
          webId: authenticatedUser.accountId as WebId,
          name: `@${authenticatedUser.shortname}`,
        },
        ...authenticatedUser.memberOf.map(({ org }) => ({
          webId: org.webId,
          name: `@${org.shortname}`,
        })),
      ];
    },
    [authenticatedUser],
    (oldValue, newValue) => {
      return (
        oldValue.length === newValue.length &&
        oldValue.every((oldWeb) =>
          newValue.some(
            (newWeb) =>
              oldWeb.webId === newWeb.webId && oldWeb.name === newWeb.name,
          ),
        )
      );
    },
  );
};
