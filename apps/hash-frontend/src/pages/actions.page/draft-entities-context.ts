import { createContext, useContext } from "react";

import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export type DraftEntitiesContextValue = {
  draftEntities?: HashEntity[];
  draftEntitiesSubgraph?: Subgraph<EntityRootType>;
  loading: boolean;
  refetch: () => Promise<void>;
};

export const DraftEntitiesContext =
  createContext<null | DraftEntitiesContextValue>(null);

export const useDraftEntities = () => {
  const draftEntitiesContext = useContext(DraftEntitiesContext);

  if (!draftEntitiesContext) {
    throw new Error("Context missing");
  }

  return draftEntitiesContext;
};
