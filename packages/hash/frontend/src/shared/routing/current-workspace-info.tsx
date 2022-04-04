import { useRouter } from "next/router";
import { createContext, FC, useContext, useMemo } from "react";

type CurrentWorkspaceInfo = {
  accountId: string;
};

const CurrentWorkspaceInfoContext = createContext<
  CurrentWorkspaceInfo | undefined
>(undefined);

/**
 * @todo we currently pull the accountId from the url and that works for now
 * although this wouldn't work when we switch to using slugs instead of accountIds in the url.
 * When that happens the accountId should be pulled properly in this component
 */
export const CurrentWorkspaceInfoProvider: FC = ({ children }) => {
  const router = useRouter();

  const workspaceSlug = router.query["workspace-slug"];

  const contextValue = useMemo<CurrentWorkspaceInfo | undefined>(
    () =>
      typeof workspaceSlug === "string"
        ? {
            accountId: workspaceSlug,
          }
        : undefined,
    [workspaceSlug],
  );

  return (
    <CurrentWorkspaceInfoContext.Provider value={contextValue}>
      {children}
    </CurrentWorkspaceInfoContext.Provider>
  );
};

export interface UseCurrentWorkspaceInfo {
  (options: { allowUndefined: true }): CurrentWorkspaceInfo | undefined;
  (options?: { allowUndefined?: false }): CurrentWorkspaceInfo;
}

export const useCurrentWorkspaceInfo: UseCurrentWorkspaceInfo = (
  options = {},
) => {
  const contextValue = useContext(CurrentWorkspaceInfoContext);

  if (!options.allowUndefined) {
    throw new Error("Unexpected ");
  }

  return contextValue as CurrentWorkspaceInfo;
};
