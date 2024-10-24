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

export const FullScreenContextProvider = ({
  children,
  fullScreenMode = "element",
}: PropsWithChildren<{ fullScreenMode?: "document" | "element" }>) => {
  const handle = useFullScreenHandle();

  const toggleFullScreen = useCallback(() => {
    if (fullScreenMode === "document") {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
      return;
    }

    if (handle.active) {
      void handle.exit();
    } else {
      void handle.enter();
    }
  }, [fullScreenMode, handle]);

  const value = useMemo<FullScreenContextType>(
    () => ({
      isFullScreen:
        fullScreenMode === "document"
          ? !!document.fullscreenElement
          : handle.active,
      toggleFullScreen,
    }),
    [handle.active, fullScreenMode, toggleFullScreen],
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
