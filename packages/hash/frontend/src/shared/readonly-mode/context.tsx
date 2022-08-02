import { useRouter } from "next/router";
import { createContext, ReactNode, useContext, useMemo } from "react";

type ReadonlyModeInfo = {
  readonlyMode: boolean;
};

const ReadonlyModeContext = createContext<ReadonlyModeInfo>({
  readonlyMode: false,
});

export const ReadonlyModeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const router = useRouter();

  const contextValue = useMemo(
    () => ({
      readonlyMode: "readonly" in router.query,
    }),
    [router],
  );

  return (
    <ReadonlyModeContext.Provider value={contextValue}>
      {children}
    </ReadonlyModeContext.Provider>
  );
};

export const useReadonlyMode = () => {
  const contextValue = useContext(ReadonlyModeContext);

  return contextValue;
};
