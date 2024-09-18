import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";

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
      {/*
       * We need height: 100% to give the Sigma Container its proper height, this class is the only way to achieve it
       * @see https://github.com/snakesilk/react-fullscreen/issues/103
       */}
      <FullScreen className="full-height-for-react-full-screen" handle={handle}>
        {children}
      </FullScreen>
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
