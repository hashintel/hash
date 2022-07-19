import React, { useContext } from "react";

type BlockContextType = {
  id: string;
  error: boolean;
  setError: (error: boolean) => void;
};

/** used to detect whether or not a context value was provided */
const nullBlockView = {};

export const BlockContext = React.createContext<BlockContextType>(
  nullBlockView as BlockContextType,
);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (blockContext === nullBlockView) {
    throw new Error("no BlockViewContext value has been provided");
  }

  return blockContext;
};
