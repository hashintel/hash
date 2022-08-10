import {
  createContext,
  FunctionComponent,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

/** @private enforces use of custom provider */
const BlockHighlightContext = createContext<{
  highlightedBlockId: string;
  setHighlightedBlockId: (blockId: string) => void;
} | null>(null);

type BlockHighlightProviderProps = {
  children?: ReactNode;
  routeHash: string;
};

export const BlockHighlightProvider: FunctionComponent<
  BlockHighlightProviderProps
> = ({ routeHash, children }) => {
  /**
   * The initial value is `routeHash`, so when the page is first open, the block which has its id in URL is highlighted
   * `highlightedBlockId` will be used when block context menus are open to indicate which block is being edited
   */
  const [highlightedBlockId, setHighlightedBlockId] =
    useState<string>(routeHash);

  const value = useMemo(
    () => ({ highlightedBlockId, setHighlightedBlockId }),
    [highlightedBlockId, setHighlightedBlockId],
  );

  return (
    <BlockHighlightContext.Provider value={value}>
      {children}
    </BlockHighlightContext.Provider>
  );
};

export const useBlockHighlightContext = () => {
  const context = useContext(BlockHighlightContext);

  if (context === null) {
    throw new Error("no value has been provided to BlockHighlightContext");
  }

  return context;
};
