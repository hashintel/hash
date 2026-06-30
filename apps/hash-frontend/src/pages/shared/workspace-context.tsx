import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { localStorageKeys } from "../../lib/config";
import { useAuthInfo } from "./auth-info-context";

import type { MinimalUser, Org } from "../../lib/user-and-org";
import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent, ReactElement } from "react";

export type WorkspaceContextValue = {
  activeWorkspace?: MinimalUser | Org;
  activeWorkspaceWebId?: WebId;
  updateActiveWorkspaceWebId: (updatedActiveWorkspaceAccountId: WebId) => void;
  refetchActiveWorkspace: () => Promise<void>;
};

const defaultWorkspaceContextValue: WorkspaceContextValue = {
  updateActiveWorkspaceWebId: (_updateActiveWorkspaceWebId: string) =>
    undefined,
  refetchActiveWorkspace: () => Promise.resolve(),
};

export const WorkspaceContext = createContext<WorkspaceContextValue>(
  defaultWorkspaceContextValue,
);

export const useActiveWorkspace = () => {
  return useContext(WorkspaceContext);
};

export const WorkspaceContextProvider: FunctionComponent<{
  children: ReactElement;
}> = ({ children }) => {
  const { authenticatedUser, refetch } = useAuthInfo();

  const [activeWorkspaceWebId, setActiveWorkspaceWebId] = useState<WebId>();

  const updateActiveWorkspaceWebId = useCallback(
    (updatedActiveWorkspaceWebId: WebId) => {
      localStorage.setItem(
        localStorageKeys.workspaceWebId,
        updatedActiveWorkspaceWebId,
      );
      setActiveWorkspaceWebId(updatedActiveWorkspaceWebId);
    },
    [],
  );

  useEffect(() => {
    if (!activeWorkspaceWebId) {
      /**
       * Initialize the `activeWorkspaceWebId` with what has been persisted
       * in `localStorage` (if anything)
       */
      const localStorageInitialValue = localStorage.getItem(
        localStorageKeys.workspaceWebId,
      );

      if (localStorageInitialValue) {
        setActiveWorkspaceWebId(localStorageInitialValue as WebId);
      } else if (authenticatedUser) {
        const defaultWorkspaceWebId =
          authenticatedUser.memberOf[0]?.org.webId ??
          (authenticatedUser.accountId as WebId);

        /**
         * Initialize the `activeWorkspaceWebId` to the first organization the
         * user belongs to, falling back to the user's account web.
         */
        updateActiveWorkspaceWebId(defaultWorkspaceWebId);
      }
    }
  }, [activeWorkspaceWebId, updateActiveWorkspaceWebId, authenticatedUser]);

  const activeWorkspace =
    authenticatedUser && authenticatedUser.accountId === activeWorkspaceWebId
      ? authenticatedUser
      : authenticatedUser?.memberOf.find(
          ({ org: { webId } }) => webId === activeWorkspaceWebId,
        )?.org;

  useEffect(() => {
    /**
     * If there is an `activeWorkspaceWebId` and an `authenticatedUser`, but
     * `activeWorkspace` is not defined, reset `activeWorkspaceWebId` to the
     * default workspace.
     */
    if (activeWorkspaceWebId && authenticatedUser && !activeWorkspace) {
      updateActiveWorkspaceWebId(
        authenticatedUser.memberOf[0]?.org.webId ??
          (authenticatedUser.accountId as WebId),
      );
    }
  }, [
    activeWorkspace,
    activeWorkspaceWebId,
    authenticatedUser,
    updateActiveWorkspaceWebId,
  ]);

  const workspaceContextValue = useMemo<WorkspaceContextValue>(() => {
    return {
      activeWorkspace,
      activeWorkspaceWebId,
      updateActiveWorkspaceWebId,
      refetchActiveWorkspace: () => refetch().then(() => undefined),
    };
  }, [
    activeWorkspace,
    activeWorkspaceWebId,
    updateActiveWorkspaceWebId,
    refetch,
  ]);

  return (
    <WorkspaceContext.Provider value={workspaceContextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};
