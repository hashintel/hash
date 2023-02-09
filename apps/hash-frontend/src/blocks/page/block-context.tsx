import { EntityRootType, Subgraph } from "@local/hash-types";
import { createContext, Dispatch, SetStateAction, useContext } from "react";

export type BlockContextType = {
  id: string;
  error: boolean;
  setError: (error: boolean) => void;
  blockSubgraph: Subgraph<EntityRootType> | undefined;
  setBlockSubgraph: Dispatch<
    SetStateAction<Subgraph<EntityRootType> | undefined>
  >;
};

export const BlockContext = createContext<BlockContextType | null>(null);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (!blockContext) {
    throw new Error("no BlockContext value has been provided");
  }

  return blockContext;
};
