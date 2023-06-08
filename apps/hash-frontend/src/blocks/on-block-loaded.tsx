import {
  createContext,
  FunctionComponent,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { getBlockDomId } from "./page/block-view";

type OnBlockLoadedFunction = (blockEntityId: string) => void;

/** @private enforces use of custom provider */
const BlockLoadedContext = createContext<{
  onBlockLoaded: OnBlockLoadedFunction;
  highlightedBlockId: string;
  setHighlightedBlockId: (blockId: string) => void;
} | null>(null);

type BlockLoadedProviderProps = {
  children?: ReactNode;
  routeHash: string;
};

export const BlockLoadedProvider: FunctionComponent<
  BlockLoadedProviderProps
> = ({ routeHash, children }) => {
  const scrollingComplete = useRef(false);
  const scrollFrameRequestIdRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);

  /**
   * The initial value is `routeHash`, so when the page is first open, the block which has its id in URL is highlighted
   * `highlightedBlockId` will be used when block context menus are open to indicate which block is being edited
   */
  const [highlightedBlockId, setHighlightedBlockId] =
    useState<string>(routeHash);

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

  const value = useMemo(
    () => ({ highlightedBlockId, setHighlightedBlockId, onBlockLoaded }),
    [highlightedBlockId, setHighlightedBlockId, onBlockLoaded],
  );

  return (
    <BlockLoadedContext.Provider value={value}>
      {children}
    </BlockLoadedContext.Provider>
  );
};

export const useBlockLoadedContext = () => {
  const state = useContext(BlockLoadedContext);

  if (state === null) {
    throw new Error("no value has been provided to BlockLoadedContext");
  }

  return state;
};
