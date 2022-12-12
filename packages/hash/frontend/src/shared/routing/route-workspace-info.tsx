import { useRouter } from "next/router";
import {
  createContext,
  FunctionComponent,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { useGetWorkspaceByShortname } from "../../components/hooks/use-get-workspace-by-shortname";
import { MinimalOrg } from "../../lib/org";
import { User } from "../../lib/user";

type RouteWorkspaceInfo = {
  routeWorkspaceShortname: string;
  routeWorkspace?: User | MinimalOrg;
};

const RouteWorkspaceInfoContext = createContext<RouteWorkspaceInfo | undefined>(
  undefined,
);

export const RouteWorkspaceInfoProvider: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const router = useRouter();

  const routeWorkspaceShortname = useMemo(() => {
    const paramsAccountSlug = router.query["account-slug"];

    return !paramsAccountSlug || Array.isArray(paramsAccountSlug)
      ? undefined
      : paramsAccountSlug.slice(1);
  }, [router]);

  const { workspace: routeWorkspace } = useGetWorkspaceByShortname(
    routeWorkspaceShortname,
  );

  const contextValue = useMemo<RouteWorkspaceInfo | undefined>(
    () =>
      routeWorkspaceShortname
        ? {
            routeWorkspaceShortname,
            routeWorkspace,
          }
        : undefined,
    [routeWorkspaceShortname, routeWorkspace],
  );

  return (
    <RouteWorkspaceInfoContext.Provider value={contextValue}>
      {children}
    </RouteWorkspaceInfoContext.Provider>
  );
};

export interface UseRouteWorkspaceInfo {
  (options: { allowUndefined: true }): RouteWorkspaceInfo | undefined;
  (options?: { allowUndefined?: false }): RouteWorkspaceInfo;
}

export const useRouteWorkspaceInfo: UseRouteWorkspaceInfo = (options = {}) => {
  const contextValue = useContext(RouteWorkspaceInfoContext);

  if (!contextValue && !options.allowUndefined) {
    throw new Error(
      "Unable to get account info (missing `account-slug` in URL)",
    );
  }

  return contextValue as RouteWorkspaceInfo;
};
