import { OwnedById } from "@local/hash-subgraph";
import {
  createContext,
  FunctionComponent,
  ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { localStorageKeys } from "../../lib/config";
import { MinimalUser, Org } from "../../lib/user-and-org";
import { useAuthInfo } from "./auth-info-context";

export type WorkspaceContextValue = {
  activeWorkspace?: MinimalUser | Org;
  activeWorkspaceOwnedById?: OwnedById;
  updateActiveWorkspaceOwnedById: (
    updatedActiveWorkspaceAccountId: OwnedById,
  ) => void;
  refetchActiveWorkspace: () => Promise<void>;
};

const defaultWorkspaceContextValue: WorkspaceContextValue = {
  updateActiveWorkspaceOwnedById: (_updateActiveWorkspaceOwnedById: string) =>
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

  const [activeWorkspaceOwnedById, setActiveWorkspaceOwnedById] =
    useState<OwnedById>();

  const updateActiveWorkspaceOwnedById = useCallback(
    (updatedActiveWorkspaceOwnedById: OwnedById) => {
      localStorage.setItem(
        localStorageKeys.workspaceOwnedById,
        updatedActiveWorkspaceOwnedById,
      );
      setActiveWorkspaceOwnedById(updatedActiveWorkspaceOwnedById);
    },
    [],
  );

  useEffect(() => {
    if (!activeWorkspaceOwnedById) {
      /**
       * Initialize the `activeWorkspaceOwnedById` with what has been persisted
       * in `localStorage` (if anything)
       */
      const localStorageInitialValue = localStorage.getItem(
        localStorageKeys.workspaceOwnedById,
      );

      if (localStorageInitialValue) {
        setActiveWorkspaceOwnedById(localStorageInitialValue as OwnedById);
      } else if (authenticatedUser) {
        /**
         * Initialize the `activeWorkspaceOwnedById` to the account ID of the
         * currently authenticated user
         */
        updateActiveWorkspaceOwnedById(
          authenticatedUser.accountId as OwnedById,
        );
      }
    }
  }, [
    activeWorkspaceOwnedById,
    updateActiveWorkspaceOwnedById,
    authenticatedUser,
  ]);

  const workspaceContextValue = useMemo<WorkspaceContextValue>(() => {
    const activeWorkspace =
      authenticatedUser &&
      authenticatedUser.accountId === activeWorkspaceOwnedById
        ? authenticatedUser
        : authenticatedUser?.memberOf.find(
            ({ org: { accountGroupId } }) =>
              accountGroupId === activeWorkspaceOwnedById,
          )?.org;

    /**
     * If there is an `activeWorkspaceOwnedById` and an `authenticatedUser`, but
     * `activeWorkspace` is not defined, reset `activeWorkspaceOwnedById` to the
     * authenticated user's account ID
     */
    if (activeWorkspaceOwnedById && authenticatedUser && !activeWorkspace) {
      updateActiveWorkspaceOwnedById(authenticatedUser.accountId as OwnedById);
    }

    return {
      activeWorkspace,
      activeWorkspaceOwnedById,
      updateActiveWorkspaceOwnedById,
      refetchActiveWorkspace: () => refetch().then(() => undefined),
    };
  }, [
    authenticatedUser,
    activeWorkspaceOwnedById,
    updateActiveWorkspaceOwnedById,
    refetch,
  ]);

  return (
    <WorkspaceContext.Provider value={workspaceContextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};
