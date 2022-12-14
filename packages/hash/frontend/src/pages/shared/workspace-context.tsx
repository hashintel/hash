import {
  ReactElement,
  useMemo,
  createContext,
  useCallback,
  useEffect,
  useState,
  FunctionComponent,
} from "react";
import { localStorageKeys } from "../../lib/config";
import { MinimalOrg } from "../../lib/org";
import { User } from "../../lib/user";
import { useAuthInfo } from "./auth-info-context";

export type WorkspaceContextValue = {
  activeWorkspace?: User | MinimalOrg;
  activeWorkspaceAccountId?: string;
  updateActiveWorkspaceAccountId: (
    updatedActiveWorkspaceAccountId: string,
  ) => void;
};

const defaultWorkspaceContextValue: WorkspaceContextValue = {
  updateActiveWorkspaceAccountId: (_updatedActiveWorkspaceAccountId: string) =>
    undefined,
};

export const WorkspaceContext = createContext<WorkspaceContextValue>(
  defaultWorkspaceContextValue,
);

export const WorkspaceContextProvider: FunctionComponent<{
  children: ReactElement;
}> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const [activeWorkspaceAccountId, setActiveWorkspaceAccountId] =
    useState<string>();

  const updateActiveWorkspaceAccountId = useCallback(
    (updatedActiveWorkspaceAccountId: string) => {
      localStorage.setItem(
        localStorageKeys.workspaceAccountId,
        updatedActiveWorkspaceAccountId,
      );
      setActiveWorkspaceAccountId(updatedActiveWorkspaceAccountId);
    },
    [],
  );

  useEffect(() => {
    if (!activeWorkspaceAccountId) {
      /**
       * Initialize the `activeWorkspaceAccountId` with what has been persisted
       * in `localStorage` (if anything)
       */
      const localStorageInitialValue = localStorage.getItem(
        localStorageKeys.workspaceAccountId,
      );

      if (localStorageInitialValue) {
        setActiveWorkspaceAccountId(localStorageInitialValue);
      } else if (authenticatedUser) {
        /**
         * Initialize the `activeWorkspaceAccountId` to the account ID of the
         * currently authenticated user
         */
        updateActiveWorkspaceAccountId(authenticatedUser.accountId);
      }
    }
  }, [
    activeWorkspaceAccountId,
    updateActiveWorkspaceAccountId,
    authenticatedUser,
  ]);

  const workspaceContextValue = useMemo<WorkspaceContextValue>(() => {
    const activeWorkspace =
      authenticatedUser &&
      authenticatedUser.accountId === activeWorkspaceAccountId
        ? authenticatedUser
        : authenticatedUser?.memberOf?.find(
            ({ accountId }) => accountId === activeWorkspaceAccountId,
          );

    /**
     * If there is an `activeWorkspaceAccountId` and an `authenticatedUser`, but
     * `activeWorkspace` is not defined, reset `activeWorkspaceAccountId` to the
     * authenticated user's account ID
     */
    if (activeWorkspaceAccountId && authenticatedUser && !activeWorkspace) {
      updateActiveWorkspaceAccountId(authenticatedUser.accountId);
    }

    return {
      activeWorkspace,
      activeWorkspaceAccountId,
      updateActiveWorkspaceAccountId,
    };
  }, [
    authenticatedUser,
    activeWorkspaceAccountId,
    updateActiveWorkspaceAccountId,
  ]);

  return (
    <WorkspaceContext.Provider value={workspaceContextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};
