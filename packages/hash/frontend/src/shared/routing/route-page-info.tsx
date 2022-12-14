import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
} from "@hashintel/hash-subgraph";
import { useRouter } from "next/router";
import {
  createContext,
  FunctionComponent,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import {
  parsePageUrlQueryParams,
  tbdIsPageParsedUrlQuery,
} from "../../pages/[account-slug]/[page-slug].page";
import { useRouteWorkspaceInfo } from "./route-workspace-info";

type RoutePageInfo = {
  routePageEntityUuid: string;
  routePageEntityId?: EntityId;
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

  const routeWorkspaceInfo = useRouteWorkspaceInfo({ allowUndefined: true });
  const { routeWorkspace } = routeWorkspaceInfo ?? {};

  const routePageEntityUuid = useMemo(() => {
    if (tbdIsPageParsedUrlQuery(router.query)) {
      return parsePageUrlQueryParams(router.query).pageEntityUuid;
    }
    return undefined;
  }, [router]);

  const routePageEntityId = useMemo(() => {
    const routeOwnedById = routeWorkspace?.accountId;

    return routeOwnedById && routePageEntityUuid
      ? entityIdFromOwnedByIdAndEntityUuid(routeOwnedById, routePageEntityUuid)
      : undefined;
  }, [routeWorkspace, routePageEntityUuid]);

  const contextValue = useMemo<RoutePageInfo | undefined>(
    () =>
      routePageEntityUuid
        ? { routePageEntityUuid, routePageEntityId }
        : undefined,
    [routePageEntityUuid, routePageEntityId],
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
