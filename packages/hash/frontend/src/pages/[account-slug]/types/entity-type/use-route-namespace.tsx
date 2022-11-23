import { useRouter } from "next/router";
import { useMemo } from "react";
import { useGetAccountIdForShortname } from "../../../../components/hooks/useGetAccountIdForShortname";

export const useRouteNamespace = ():
  | {
      accountId: string;
      shortname?: string;
    }
  | undefined => {
  const router = useRouter();
  const shortname = router.query["account-slug"];

  if (Array.isArray(shortname)) {
    throw new Error("shortname can't be an array");
  }

  const { accountId } = useGetAccountIdForShortname(
    shortname ? shortname.substring(1) : undefined,
  );

  return useMemo(() => {
    if (accountId) {
      return {
        accountId,
        shortname,
      };
    } else {
      return undefined;
    }
  }, [accountId, shortname]);
};
