import {
  ReactElement,
  useMemo,
  createContext,
  useCallback,
  useEffect,
  useState,
  FunctionComponent,
} from "react";
import { AccountId } from "@hashintel/hash-shared/types";

import { localStorageKeys } from "../../lib/config";
import { MinimalOrg } from "../../lib/org";
import { User } from "../../lib/user";
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
        updateActiveWorkspaceAccountId(authenticatedUser.userAccountId);
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
      authenticatedUser.userAccountId === activeWorkspaceAccountId
        ? authenticatedUser
        : authenticatedUser?.memberOf?.find(
            ({ orgAccountId }) => orgAccountId === activeWorkspaceAccountId,
          );

    /**
     * If there is an `activeWorkspaceAccountId` and an `authenticatedUser`, but
     * `activeWorkspace` is not defined, reset `activeWorkspaceAccountId` to the
     * authenticated user's account ID
     */
    if (activeWorkspaceAccountId && authenticatedUser && !activeWorkspace) {
      updateActiveWorkspaceAccountId(authenticatedUser.userAccountId);
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
