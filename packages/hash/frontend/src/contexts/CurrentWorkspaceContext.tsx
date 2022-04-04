import { useRouter } from "next/router";
import { createContext, FC, useContext, useMemo } from "react";

type CurrentWorkspaceContextState = {
  accountId?: string;
};

const CurrentWorkspaceContext = createContext<CurrentWorkspaceContextState>({
  accountId: undefined,
});

export const useCurrentWorkspaceContext = () =>
  useContext(CurrentWorkspaceContext);

/**
 * @todo we currently pull the accountId from the url and that works for now
 * although this wouldn't work when we switch to using slugs instead of accountIds in the url.
 * When that happens the accountId should be pulled properly in this component
 */
export const CurrentWorkspaceContextProvider: FC = ({ children }) => {
  const router = useRouter();

  const value = useMemo(
    () => ({
      accountId: router.query.accountId as string, // @todo we should handle when accountId is undefined
    }),
    [router],
  );

  return (
    <CurrentWorkspaceContext.Provider value={value}>
      {children}
    </CurrentWorkspaceContext.Provider>
  );
};
