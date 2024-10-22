import type { OwnedById } from "@local/hash-graph-types/web";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { useMemo } from "react";

import { useUserOrOrg } from "../../shared/use-user-or-org";

export const useUserOrOrgShortnameByOwnedById = (params: {
  ownedById: OwnedById | null;
}) => {
  const { ownedById } = params;

  const { userOrOrg, loading } = useUserOrOrg({
    accountOrAccountGroupId: ownedById ?? undefined,
  });

  const shortname = useMemo(() => {
    console.log("Updating");
    if (userOrOrg) {
      return simplifyProperties(userOrOrg.properties).shortname;
    }
    return undefined;
  }, [userOrOrg]);

  return { shortname, loading };
};
