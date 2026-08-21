import { createContext, useContext } from "react";

import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./config-control";
import type { GraphVizFilters } from "./filter-control";
import type { GraphState } from "./state";
import type { RefObject } from "react";

export type GraphContextType<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = {
  config: GraphVizConfig<NodeSizing>;
  configPanelOpen: boolean;
  filters: GraphVizFilters;
  filterPanelOpen: boolean;
  graphContainerRef: RefObject<HTMLDivElement | null>;
  graphState: GraphState;
  pathFinderPanelOpen: boolean;
  refreshGraphHighlights: () => void;
  searchPanelOpen: boolean;
  setConfig: (config: GraphVizConfig<NodeSizing>) => void;
  setConfigPanelOpen: (open: boolean) => void;
  setFilters: (filters: GraphVizFilters) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setGraphState: <K extends keyof GraphState>(
    key: K,
    value: GraphState[K],
  ) => void;
  setPathFinderPanelOpen: (open: boolean) => void;
  setSearchPanelOpen: (open: boolean) => void;
};

export const GraphContext = createContext<GraphContextType<
  DynamicNodeSizing | StaticNodeSizing
> | null>(null);

export const useGraphContext = () => {
  const context = useContext(GraphContext);

  if (!context) {
    throw new Error("no GraphContext value has been provided");
  }

  return context;
};
