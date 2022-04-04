import { useRouter } from "next/router";
import { createContext, FC, useContext, useMemo } from "react";

type RouteAccountInfo = {
  accountId: string;
};

const RouteAccountInfoContext = createContext<RouteAccountInfo | undefined>(
  undefined,
);

/**
 * @todo we currently pull the accountId from the url and that works for now
 * although this wouldn't work when we switch to using slugs instead of accountIds in the url.
 * When that happens the accountId should be pulled properly in this component
 */
export const RouteAccountInfoProvider: FC = ({ children }) => {
  const router = useRouter();

  const workspaceSlug = router.query["workspace-slug"];

  const contextValue = useMemo<RouteAccountInfo | undefined>(
    () =>
      typeof workspaceSlug === "string"
        ? {
            accountId: workspaceSlug,
          }
        : undefined,
    [workspaceSlug],
  );

  return (
    <RouteAccountInfoContext.Provider value={contextValue}>
      {children}
    </RouteAccountInfoContext.Provider>
  );
};

export interface UseRouteAccountInfo {
  (options: { allowUndefined: true }): RouteAccountInfo | undefined;
  (options?: { allowUndefined?: false }): RouteAccountInfo;
}

export const useRouteAccountInfo: UseRouteAccountInfo = (options = {}) => {
  const contextValue = useContext(RouteAccountInfoContext);

  if (!options.allowUndefined) {
    throw new Error("Unexpected ");
  }

  return contextValue as RouteAccountInfo;
};
