import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent, ReactElement } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { localStorageKeys } from "../../lib/config";
import type { MinimalUser, Org } from "../../lib/user-and-org";
import { useAuthInfo } from "./auth-info-context";

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
        /**
         * Initialize the `activeWorkspaceWebId` to the account ID of the
         * currently authenticated user
         */
        updateActiveWorkspaceWebId(authenticatedUser.accountId as WebId);
      }
    }
  }, [activeWorkspaceWebId, updateActiveWorkspaceWebId, authenticatedUser]);

  const workspaceContextValue = useMemo<WorkspaceContextValue>(() => {
    const activeWorkspace =
      authenticatedUser && authenticatedUser.accountId === activeWorkspaceWebId
        ? authenticatedUser
        : authenticatedUser?.memberOf.find(
            ({ org: { webId } }) => webId === activeWorkspaceWebId,
          )?.org;

    /**
     * If there is an `activeWorkspaceWebId` and an `authenticatedUser`, but
     * `activeWorkspace` is not defined, reset `activeWorkspaceWebId` to the
     * authenticated user's account ID
     */
    if (activeWorkspaceWebId && authenticatedUser && !activeWorkspace) {
      updateActiveWorkspaceWebId(authenticatedUser.accountId as WebId);
    }

    return {
      activeWorkspace,
      activeWorkspaceWebId,
      updateActiveWorkspaceWebId,
      refetchActiveWorkspace: () => refetch().then(() => undefined),
    };
  }, [
    authenticatedUser,
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
