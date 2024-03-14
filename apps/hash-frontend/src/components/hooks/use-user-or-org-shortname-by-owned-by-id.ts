import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { OwnedById } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useUserOrOrg } from "../../shared/use-user-or-org";

export const useUserOrOrgShortnameByOwnedById = (params: {
  ownedById: OwnedById;
}) => {
  const { ownedById } = params;

  const { userOrOrg, loading } = useUserOrOrg({
    accountOrAccountGroupId: ownedById,
  });

  const shortname = useMemo(() => {
    if (userOrOrg) {
      return simplifyProperties(userOrOrg.properties).shortname;
    }
    return undefined;
  }, [userOrOrg]);

  return { shortname, loading };
};
