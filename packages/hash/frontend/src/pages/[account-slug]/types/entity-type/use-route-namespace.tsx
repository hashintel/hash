import { useRouter } from "next/router";
import { useMemo } from "react";
import { useGetAccountIdForShortname } from "../../../../components/hooks/useGetAccountIdForShortname";

export const useRouteNamespace = (): {
  loading: boolean;
  routeNamespace?: {
    accountId: string;
    shortname?: string;
  };
} => {
  const router = useRouter();
  const shortname = router.query["account-slug"];

  if (Array.isArray(shortname)) {
    throw new Error("shortname can't be an array");
  }

  const shortnameWithoutPrefix = shortname ? shortname.substring(1) : undefined;
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
    } else {
      return { loading };
    }
  }, [loading, accountId, shortnameWithoutPrefix]);
};
