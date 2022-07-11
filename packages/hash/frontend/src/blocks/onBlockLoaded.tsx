import { createContext, useCallback, useContext, useRef } from "react";
import { getBlockDomId } from "./page/BlockView";

type OnBlockLoadedFunction = (blockEntityId: string) => void;

/** @private enforces use of custom provider */
const BlockLoadedContext = createContext<OnBlockLoadedFunction | null>(null);

export const BlockLoadedProvider: React.FC<{ routeHash: string }> = ({
  routeHash,
  children,
}) => {
  const scrollingComplete = useRef(false);
  const scrollFrameRequestIdRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  const onBlockLoaded = useCallback(
    (blockEntityId: string) => {
      function frame(idToScrollTo: string) {
        const routeElement = document.getElementById(idToScrollTo);

        if (routeElement) {
          routeElement.scrollIntoView();
          scrollingComplete.current = true;
        }
      }

      function clearScrollInterval() {
        if (scrollFrameRequestIdRef.current !== null) {
          cancelAnimationFrame(scrollFrameRequestIdRef.current);
          scrollFrameRequestIdRef.current = null;
        }
      }

      if (
        routeHash === getBlockDomId(blockEntityId) &&
        !scrollingComplete.current
      ) {
        clearScrollInterval();
        scrollFrameRequestIdRef.current = requestAnimationFrame(() =>
          frame(routeHash),
        );
      }
    },
    [routeHash],
  );

  return (
    <BlockLoadedContext.Provider value={onBlockLoaded}>
      {children}
    </BlockLoadedContext.Provider>
  );
};

export const useBlockLoaded = () => {
  const state = useContext(BlockLoadedContext);

  if (state === null) {
    throw new Error("no value has been provided to BlockLoadedContext");
  }

  return state;
};
