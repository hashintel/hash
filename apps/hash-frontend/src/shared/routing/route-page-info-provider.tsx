import { useRouter } from "next/router";
import { useMemo } from "react";

import {
  isPageParsedUrlQuery,
  parsePageUrlQueryParams,
  type RoutePageInfo,
  RoutePageInfoContext,
} from "./route-page-info";

import type { FunctionComponent, ReactNode } from "react";

/**
 * @todo we currently pull the pageEntityId from the url and that works for now
 * although this wouldn't work when we switch to using slugs instead of pageEntityIds in the url.
 * When that happens the pageEntityId should be pulled properly in this component
 */
export const RoutePageInfoProvider: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const router = useRouter();

  const routePageEntityUuid = useMemo(() => {
    if (isPageParsedUrlQuery(router.query)) {
      return parsePageUrlQueryParams(router.query).pageEntityUuid;
    }
    return undefined;
  }, [router]);

  const contextValue = useMemo<RoutePageInfo | undefined>(
    () => (routePageEntityUuid ? { routePageEntityUuid } : undefined),
    [routePageEntityUuid],
  );

  return (
    <RoutePageInfoContext.Provider value={contextValue}>
      {children}
    </RoutePageInfoContext.Provider>
  );
};
