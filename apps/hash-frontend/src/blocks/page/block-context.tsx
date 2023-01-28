import { Subgraph, SubgraphRootTypes } from "@blockprotocol/graph";
import { createContext, Dispatch, SetStateAction, useContext } from "react";

export type BlockContextType = {
  id: string;
  error: boolean;
  setError: (error: boolean) => void;
  blockSubgraph: Subgraph<SubgraphRootTypes["entity"]> | undefined;
  setBlockSubgraph: Dispatch<
    SetStateAction<Subgraph<SubgraphRootTypes["entity"]> | undefined>
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
