import type { AccountId } from "@local/hash-graph-types/account";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useGetAccountIdForShortname } from "../../../../components/hooks/use-get-account-id-for-shortname";

export const useRouteNamespace = (): {
  loading: boolean;
  routeNamespace?: {
    accountId: AccountId;
    shortname?: string;
  };
} => {
  const router = useRouter();
  const shortname = router.query.shortname;

  if (Array.isArray(shortname)) {
    throw new Error("shortname can't be an array");
  }

  const { loading, accountId } = useGetAccountIdForShortname(shortname);

  return useMemo(() => {
    if (!loading && accountId) {
      return {
        loading,
        routeNamespace: {
          accountId,
          shortname,
        },
      };
    } else {
      return { loading };
    }
  }, [loading, accountId, shortname]);
};
