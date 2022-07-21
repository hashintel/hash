import React, { useContext } from "react";

type BlockContextType = {
  id: string;
  error: boolean;
  setError: (error: boolean) => void;
};

export const BlockContext = React.createContext<BlockContextType | null>(null);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (!blockContext) {
    throw new Error("no BlockViewContext value has been provided");
  }

  return blockContext;
};
