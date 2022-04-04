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

  const accountSlug = router.query["account-slug"];

  const contextValue = useMemo<RouteAccountInfo | undefined>(
    () =>
      typeof accountSlug === "string"
        ? {
            accountId: accountSlug, // @todo parse and use suspense for lookup if needed
          }
        : undefined,
    [accountSlug],
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
    throw new Error(
      "Unable to get account info (missing `account-slug` in URL)",
    );
  }

  return contextValue as RouteAccountInfo;
};
