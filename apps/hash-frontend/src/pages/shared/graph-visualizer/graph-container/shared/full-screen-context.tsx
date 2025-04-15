import type { PropsWithChildren, RefObject } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";

import { useSlideStack } from "../../../slide-stack";

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
  graphContainerRef,
}: PropsWithChildren<{
  fullScreenMode?: "document" | "element";
  graphContainerRef: RefObject<HTMLDivElement | null>;
}>) => {
  const handle = useFullScreenHandle();

  const { setSlideContainerRef } = useSlideStack();

  const toggleFullScreen = useCallback(async () => {
    if (fullScreenMode === "document") {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      return;
    }

    if (handle.active) {
      await handle.exit();
      setSlideContainerRef(null);
    } else {
      await handle.enter();
      setSlideContainerRef(graphContainerRef);
    }
  }, [fullScreenMode, handle, graphContainerRef, setSlideContainerRef]);

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
      <FullScreen
        /*
         * We need height: 100% to give the Sigma Container its proper height and width, this class is the only way to achieve it
         * @see https://github.com/snakesilk/react-fullscreen/issues/103
         */
        className="full-height-and-width-for-react-full-screen"
        handle={handle}
      >
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
