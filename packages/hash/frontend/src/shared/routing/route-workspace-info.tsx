import { useRouter } from "next/router";
import {
  createContext,
  FunctionComponent,
  ReactNode,
  useContext,
  useMemo,
} from "react";

import { useWorkspaceByShortname } from "../../components/hooks/use-workspace-by-shortname";
import { MinimalOrg, User } from "../../lib/user-and-org";

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
    const paramsShortname = router.query.shortname;

    return !paramsShortname || Array.isArray(paramsShortname)
      ? undefined
      : paramsShortname.slice(1);
  }, [router]);

  const { workspace: routeWorkspace } = useWorkspaceByShortname(
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
    throw new Error("Unable to get account info (missing `shortname` in URL)");
  }

  return contextValue as RouteWorkspaceInfo;
};
