import { useRouter } from "next/router";
import { createContext, ReactNode, useContext, useMemo } from "react";

export type ReadonlyModeInfo = {
  readonlyMode: boolean;
};

const ReadonlyModeContext = createContext<ReadonlyModeInfo>({
  readonlyMode: false,
});

/**
 * This context provider is responsible for letting the app know if a
 * page is in read-only mode. Right now we temporarily check for this by checking if
 * "readonly" query parameter is present in the page's url. A better approach for doing this
 * will be implemented later
 */
export const ReadonlyModeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const router = useRouter();

  const readonlyMode = "readonly" in router.query;

  const contextValue = useMemo(
    () => ({
      readonlyMode,
    }),
    [readonlyMode],
  );

  return (
    <ReadonlyModeContext.Provider value={contextValue}>
      {children}
    </ReadonlyModeContext.Provider>
  );
};

export const useReadonlyMode = (): ReadonlyModeInfo => {
  const contextValue = useContext(ReadonlyModeContext);

  return contextValue;
};
