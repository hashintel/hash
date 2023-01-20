import { createContext, useContext } from "react";

type BlockContextType = {
  id: string;
  error: boolean;
  setError: (error: boolean) => void;
};

export const BlockContext = createContext<BlockContextType | null>(null);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (!blockContext) {
    throw new Error("no BlockContext value has been provided");
  }

  return blockContext;
};
