import type { WebId } from "@blockprotocol/type-system";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useGetWebIdForShortname } from "../../../../components/hooks/use-get-account-id-for-shortname";

export const useRouteNamespace = (): {
  loading: boolean;
  routeNamespace?: {
    webId: WebId;
    shortname?: string;
  };
} => {
  const router = useRouter();
  let shortname = router.query.shortname;

  if (Array.isArray(shortname)) {
    throw new Error("shortname can't be an array");
  }

  /**
   * router.query is not populated in [...slug-maybe-version].page.tsx, probably some combination of the rewrite @[shortname] routes and the fact it is a catch all.
   * We have to parse out the path ourselves.
   *
   * @see https://github.com/vercel/next.js/issues/50212 –– possibly related
   */
  shortname ??= router.asPath.match(/\/@([^/]+)/)?.[1];

  const { loading, webId } = useGetWebIdForShortname(shortname);

  return useMemo(() => {
    if (!loading && webId) {
      return {
        loading,
        routeNamespace: {
          webId,
          shortname,
        },
      };
    } else {
      return { loading };
    }
  }, [loading, webId, shortname]);
};
