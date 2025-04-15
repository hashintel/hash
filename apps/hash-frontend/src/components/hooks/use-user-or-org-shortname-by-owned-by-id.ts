import type { WebId } from "@blockprotocol/type-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { useMemo } from "react";

import { useUserOrOrg } from "../../shared/use-user-or-org";

export const useUserOrOrgShortnameByWebId = (params: {
  webId: WebId | null;
}) => {
  const { webId } = params;

  const { userOrOrg, loading } = useUserOrOrg({
    accountOrAccountGroupId: webId ?? undefined,
  });

  const shortname = useMemo(() => {
    if (userOrOrg) {
      return simplifyProperties(userOrOrg.properties).shortname;
    }
    return undefined;
  }, [userOrOrg]);

  return { shortname, loading };
};
