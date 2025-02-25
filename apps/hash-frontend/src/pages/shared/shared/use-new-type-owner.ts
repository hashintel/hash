import type { VersionedUrl } from "@blockprotocol/type-system";
import { useMemo } from "react";

import { useGetOwnedByIdForShortname } from "../../../components/hooks/use-get-account-id-for-shortname";
import { useAuthInfo } from "../auth-info-context";
import { useActiveWorkspace } from "../workspace-context";

/**
 * Decide the ownedById of a new type that a user is creating within the context of another type,
 * e.g. creating a property type to attach to an entity type, or extending a type.
 */
export const useNewTypeOwner = (startingTypeId: VersionedUrl) => {
  const shortname = startingTypeId.match(/\/@([^/]+)/)?.[1];

  const { ownedById: startingTypeOwnedById } =
    useGetOwnedByIdForShortname(shortname);

  const { authenticatedUser } = useAuthInfo();

  const { activeWorkspaceOwnedById } = useActiveWorkspace();

  return useMemo(() => {
    const matchingWeb =
      startingTypeOwnedById &&
      (authenticatedUser?.accountId === startingTypeOwnedById ||
        authenticatedUser?.memberOf.some(
          (memberOf) => memberOf.org.accountGroupId === startingTypeOwnedById,
        ));

    /**
     * If the type we're creating another type from is in a web the user belongs to, use that web.
     */
    if (matchingWeb) {
      return startingTypeOwnedById;
    }

    /**
     * Otherwise, use the active workspace.
     */
    return activeWorkspaceOwnedById;
  }, [activeWorkspaceOwnedById, authenticatedUser, startingTypeOwnedById]);
};
