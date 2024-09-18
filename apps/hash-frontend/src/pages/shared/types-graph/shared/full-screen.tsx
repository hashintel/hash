import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useFullScreenHandle, FullScreen } from "react-full-screen";

export type FullScreenContextType = {
  isFullScreen: boolean;
  toggleFullScreen: () => void;
};

export const FullScreenContext = createContext<FullScreenContextType | null>(
  null,
);

export const FullScreenContextProvider = ({ children }: PropsWithChildren) => {
  const handle = useFullScreenHandle();

  const toggleFullScreen = useCallback(() => {
    if (handle.active) {
      void handle.exit();
    } else {
      void handle.enter();
    }
  }, [handle]);

  const value = useMemo<FullScreenContextType>(
    () => ({
      isFullScreen: handle.active,
      toggleFullScreen,
    }),
    [handle.active, toggleFullScreen],
  );

  return (
    <FullScreenContext.Provider value={value}>
      <FullScreen handle={handle}>{children}</FullScreen>
    </FullScreenContext.Provider>
  );
};

export const useFullScreen = () => {
  const context = useContext(FullScreenContext);

  if (!context) {
    throw new Error("no FullScreenContext value has been provided");
  }

  return context;
};
