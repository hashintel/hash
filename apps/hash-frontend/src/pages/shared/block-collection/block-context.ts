import { createContext, useContext } from "react";

import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityPermissionsMap } from "@local/hash-graph-sdk/entity";
import type { Dispatch, SetStateAction } from "react";

export type BlockContextType = {
  error: boolean;
  setError: (error: boolean) => void;
  blockSelectDataModalIsOpen: boolean;
  setBlockSelectDataModalIsOpen: (isOpen: boolean) => void;
  blockSubgraph: Subgraph<EntityRootType> | undefined;
  setBlockSubgraph: Dispatch<
    SetStateAction<Subgraph<EntityRootType> | undefined>
  >;
  userPermissions: EntityPermissionsMap | undefined;
  setUserPermissions: (permissions: EntityPermissionsMap) => void;
};

export const BlockContext = createContext<BlockContextType | null>(null);

export const useBlockContext = () => {
  const blockContext = useContext(BlockContext);

  if (!blockContext) {
    throw new Error("no BlockContext value has been provided");
  }

  return blockContext;
};
