import { createContext, useContext } from "react";

import type { MinimalUser, Org } from "../../lib/user-and-org";
import type { WebId } from "@blockprotocol/type-system";

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
