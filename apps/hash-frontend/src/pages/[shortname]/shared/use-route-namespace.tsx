import { useRouter } from "next/router";
import { useMemo } from "react";
import type { AccountId } from "@local/hash-graph-types/account";

import { useGetAccountIdForShortname } from "../../../components/hooks/use-get-account-id-for-shortname";

export const useRouteNamespace = (): {
  loading: boolean;
  routeNamespace?: {
    accountId: AccountId;
    shortname?: string;
  };
} => {
  const router = useRouter();
  const { shortname } = router.query;

  if (Array.isArray(shortname)) {
    throw new TypeError("shortname can't be an array");
  }

  const shortnameWithoutPrefix = shortname ? shortname.slice(1) : undefined;
  const { loading, accountId } = useGetAccountIdForShortname(
    shortnameWithoutPrefix,
  );

  return useMemo(() => {
    if (!loading && accountId) {
      return {
        loading,
        routeNamespace: {
          accountId,
          shortname: shortnameWithoutPrefix,
        },
      };
    }

    return { loading };
  }, [loading, accountId, shortnameWithoutPrefix]);
};
