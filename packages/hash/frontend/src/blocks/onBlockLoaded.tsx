import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getBlockDomId } from "./page/BlockView";

type OnBlockLoadedFunction = (blockEntityId: string) => void;

/** @private enforces use of custom provider */
const BlockLoadedContext = createContext<OnBlockLoadedFunction | null>(null);

export const BlockLoadedProvider: React.FC<{ routeHash: string }> = ({
  routeHash,
  children,
}) => {
  const [hashToScrollTo, setHashToScrollTo] = useState<string | null>(null);

  const onBlockLoaded = useCallback((blockEntityId: string) => {
    if (routeHash === getBlockDomId(blockEntityId)) {
      setHashToScrollTo(routeHash);
    }
  }, []);

  const scrollingComplete = useRef(false);
  const scrollFrameRequestIdRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  useEffect(() => {
    function frame(hashToScrollTo: string) {
      const routeElement = document.getElementById(hashToScrollTo);

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

    if (hashToScrollTo && !scrollingComplete.current) {
      clearScrollInterval();
      scrollFrameRequestIdRef.current = requestAnimationFrame(() =>
        frame(hashToScrollTo),
      );
    }

    return () => {
      clearScrollInterval();
    };
  }, [hashToScrollTo]);

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
