import type { Edge } from "reactflow";

export type PetriNetEdge = Edge<{
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
}>;
