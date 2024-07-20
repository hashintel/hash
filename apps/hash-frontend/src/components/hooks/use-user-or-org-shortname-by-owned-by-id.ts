import { useMemo } from "react";
import type { OwnedById } from "@local/hash-graph-types/web";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { useUserOrOrg } from "../../shared/use-user-or-org";

export const useUserOrOrgShortnameByOwnedById = (params: {
  ownedById: OwnedById | null;
}) => {
  const { ownedById } = params;

  const { userOrOrg, loading } = useUserOrOrg({
    accountOrAccountGroupId: ownedById ?? undefined,
  });

  const shortname = useMemo(() => {
    if (userOrOrg) {
      return simplifyProperties(userOrOrg.properties).shortname;
    }

    return undefined;
  }, [userOrOrg]);

  return { shortname, loading };
};
