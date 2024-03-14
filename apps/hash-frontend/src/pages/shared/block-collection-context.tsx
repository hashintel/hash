import type { UserPermissionsOnEntities } from "@local/hash-isomorphic-utils/types";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

export type BlockCollectionContextType = {
  blockCollectionSubgraph?: Subgraph<EntityRootType>;
  userPermissionsOnEntities?: UserPermissionsOnEntities;
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

export const BlockCollectionContextProvider = ({
  children,
  blockCollectionSubgraph,
  userPermissionsOnEntities,
}: PropsWithChildren<BlockCollectionContextType>) => {
  const context = useMemo<BlockCollectionContextType>(
    () => ({
      blockCollectionSubgraph,
      userPermissionsOnEntities,
    }),
    [blockCollectionSubgraph, userPermissionsOnEntities],
  );

  return (
    <BlockCollectionContext.Provider value={context}>
      {children}
    </BlockCollectionContext.Provider>
  );
};
