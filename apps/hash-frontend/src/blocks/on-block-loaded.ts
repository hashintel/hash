import { createContext, useContext } from "react";

type OnBlockLoadedFunction = (blockEntityId: string) => void;

export const BlockLoadedContext = createContext<{
  onBlockLoaded: OnBlockLoadedFunction;
  highlightedBlockId?: string;
  setHighlightedBlockId: (blockId: string | undefined) => void;
} | null>(null);

export const useBlockLoadedContext = () => {
  const state = useContext(BlockLoadedContext);

  if (state === null) {
    throw new Error("no value has been provided to BlockLoadedContext");
  }

  return state;
};
