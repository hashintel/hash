import { useMemoCompare } from "../../../shared/use-memo-compare";
import { useAuthenticatedUser } from "../auth-info-context";

import type { InternalWeb } from "./web-filter-pill";

/**
 * The authenticated user's own and org webs for the web filter pill, with a
 * stable identity across user refetches.
 */
export const useInternalWebs = (): InternalWeb[] => {
  const { authenticatedUser } = useAuthenticatedUser();

  return useMemoCompare(
    () => [
      {
        webId: authenticatedUser.accountId,
        name: `@${authenticatedUser.shortname}`,
      },
      ...authenticatedUser.memberOf.map(({ org }) => ({
        webId: org.webId,
        name: `@${org.shortname}`,
      })),
    ],
    [authenticatedUser],
    (oldValue, newValue) =>
      oldValue.length === newValue.length &&
      oldValue.every((oldWeb) =>
        newValue.some(
          (newWeb) =>
            oldWeb.webId === newWeb.webId && oldWeb.name === newWeb.name,
        ),
      ),
  );
};
