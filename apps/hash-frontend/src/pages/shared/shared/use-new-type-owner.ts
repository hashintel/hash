import type { VersionedUrl } from "@blockprotocol/type-system";
import { useMemo } from "react";

import { useGetWebIdForShortname } from "../../../components/hooks/use-get-account-id-for-shortname";
import { useAuthInfo } from "../auth-info-context";
import { useActiveWorkspace } from "../workspace-context";

/**
 * Decide the webId of a new type that a user is creating within the context of another type,
 * e.g. creating a property type to attach to an entity type, or extending a type.
 */
export const useNewTypeOwner = (startingTypeId: VersionedUrl) => {
  const shortname = startingTypeId.match(/\/@([^/]+)/)?.[1];

  const { webId: startingTypeWebId } = useGetWebIdForShortname(shortname);

  const { authenticatedUser } = useAuthInfo();

  const { activeWorkspaceWebId } = useActiveWorkspace();

  return useMemo(() => {
    const matchingWeb =
      startingTypeWebId &&
      (authenticatedUser?.accountId === startingTypeWebId ||
        authenticatedUser?.memberOf.some(
          (memberOf) => memberOf.org.webId === startingTypeWebId,
        ));

    /**
     * If the type we're creating another type from is in a web the user belongs to, use that web.
     */
    if (matchingWeb) {
      return startingTypeWebId;
    }

    /**
     * Otherwise, use the active workspace.
     */
    return activeWorkspaceWebId;
  }, [activeWorkspaceWebId, authenticatedUser, startingTypeWebId]);
};
