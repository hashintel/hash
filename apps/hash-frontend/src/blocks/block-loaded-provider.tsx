import { useCallback, useMemo, useRef, useState } from "react";

import { getBlockDomId } from "../shared/get-block-dom-id";
import { BlockLoadedContext } from "./on-block-loaded";

import type { FunctionComponent, ReactNode } from "react";

type BlockLoadedProviderProps = {
  children?: ReactNode;
  routeHash?: string;
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
  const [highlightedBlockId, setHighlightedBlockId] = useState<
    string | undefined
  >(routeHash);

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
