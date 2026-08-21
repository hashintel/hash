import { createContext, useContext } from "react";

import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  EntityPermissionsMap,
  HashEntity,
} from "@local/hash-graph-sdk/entity";

export type BlockCollectionContextType = {
  blockCollectionSubgraph?: Subgraph<EntityRootType<HashEntity>>;
  userPermissionsOnEntities?: EntityPermissionsMap;
};

export const BlockCollectionContext =
  createContext<BlockCollectionContextType | null>(null);

export const useBlockCollectionContext = () => {
  const blockCollectionContext = useContext(BlockCollectionContext);

  if (!blockCollectionContext) {
    throw new Error("no BlockCollectionContext value has been provided");
  }

  return blockCollectionContext;
};
