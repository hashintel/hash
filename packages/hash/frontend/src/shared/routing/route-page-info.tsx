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

type RoutePageInfo = {
  pageEntityId: EntityId;
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

  const accountSlug = router.query["account-slug"];
  const pageSlug = router.query["page-slug"];

  const contextValue = useMemo<RoutePageInfo | undefined>(() => {
    return typeof accountSlug === "string" && typeof pageSlug === "string"
      ? {
          // @todo parse and use suspense for lookup if needed
          pageEntityId: entityIdFromOwnedByIdAndEntityUuid(
            accountSlug,
            pageSlug,
          ),
        }
      : undefined;
  }, [accountSlug, pageSlug]);

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
