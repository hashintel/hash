import { AccountId } from "@local/hash-types";
import {
  createContext,
  FunctionComponent,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { localStorageKeys } from "../../lib/config";
import { MinimalOrg, User } from "../../lib/user-and-org";
import { useAuthInfo } from "./auth-info-context";

export type WorkspaceContextValue = {
  activeWorkspace?: User | MinimalOrg;
  activeWorkspaceAccountId?: AccountId;
  updateActiveWorkspaceAccountId: (
    updatedActiveWorkspaceAccountId: AccountId,
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
    useState<AccountId>();

  const updateActiveWorkspaceAccountId = useCallback(
    (updatedActiveWorkspaceAccountId: AccountId) => {
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
        setActiveWorkspaceAccountId(localStorageInitialValue as AccountId);
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
        : authenticatedUser?.memberOf.find(
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
