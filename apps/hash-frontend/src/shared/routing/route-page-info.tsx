import { EntityUuid } from "@local/hash-subgraph";
import { useRouter } from "next/router";
import {
  createContext,
  FunctionComponent,
  ReactNode,
  useContext,
  useMemo,
} from "react";

import {
  isPageParsedUrlQuery,
  parsePageUrlQueryParams,
} from "../../pages/[shortname]/[page-slug].page";

type RoutePageInfo = {
  routePageEntityUuid: EntityUuid;
};

const RoutePageInfoContext = createContext<RoutePageInfo | undefined>(
  undefined,
);

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

export interface UseRoutePageInfo {
  (options: { allowUndefined: true }): RoutePageInfo | undefined;
  (options?: { allowUndefined?: false }): RoutePageInfo;
}

export const useRoutePageInfo: UseRoutePageInfo = (options = {}) => {
  const contextValue = useContext(RoutePageInfoContext);

  if (!contextValue && !options.allowUndefined) {
    throw new Error("Unable to get page info (missing `page-slug` in URL)");
  }

  return contextValue as RoutePageInfo;
};
