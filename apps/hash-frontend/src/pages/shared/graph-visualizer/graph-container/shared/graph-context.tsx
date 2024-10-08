import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalstorageState } from "rooks";

import type { GraphVizConfig } from "./config-control";
import type { GraphVizFilters } from "./filter-control";
import type { GraphState } from "./state";
import { useEventHandlers } from "./use-event-handlers";
import { useSetDrawSettings } from "./use-set-draw-settings";

export type GraphContextType = {
  config: GraphVizConfig;
  configPanelOpen: boolean;
  filters: GraphVizFilters;
  filterPanelOpen: boolean;
  graphState: GraphState;
  refreshGraphHighlights: () => void;
  setConfig: (config: GraphVizConfig) => void;
  setConfigPanelOpen: (open: boolean) => void;
  setFilters: (filters: GraphVizFilters) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setGraphState: <K extends keyof GraphState>(
    key: K,
    value: GraphState[K],
  ) => void;
};

export const GraphContext = createContext<GraphContextType | null>(null);

export type GraphContextProviderProps = {
  defaultConfig: GraphVizConfig;
  onEdgeClick?: (params: { edgeId: string; isFullScreen: boolean }) => void;
  onNodeSecondClick?: (params: {
    nodeId: string;
    isFullScreen: boolean;
  }) => void;
};

export const GraphContextProvider = ({
  children,
  defaultConfig,
  onEdgeClick,
  onNodeSecondClick,
}: PropsWithChildren<GraphContextProviderProps>) => {
  const [config, setConfig] = useLocalstorageState<GraphVizConfig>(
    `graph-viz-config~${defaultConfig.graphKey}`,
    defaultConfig,
  );

  const [filters, setFilters] = useLocalstorageState<GraphVizFilters>(
    `graph-viz-filters~${defaultConfig.graphKey}`,
    {},
  );

  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  /**
   * State to track interactions with the graph.
   * It's drawn in canvas so doesn't need to be in React state
   * – redrawing the graph is done via sigma.refresh.
   */
  const graphState = useRef<GraphState>({
    /**
     * We store colorByNodeId in the graph state so that we can refresh the graph when it changes,
     * without having to reload all the graph data or recreate the node reducers
     * (which we'd have to do if we made them dependent on React state)
     */
    colorByNodeTypeId: filters.colorByNodeTypeId,
    hoveredNodeId: null,
    highlightedNeighborIds: null,
    selectedNodeId: null,
  });

  const setGraphState: GraphContextType["setGraphState"] = useCallback(
    (key, value) => {
      graphState.current[key] = value;
    },
    [],
  );

  useSetDrawSettings(graphState.current);

  const { refreshGraphHighlights } = useEventHandlers({
    config,
    graphState: graphState.current,
    onEdgeClick,
    onNodeSecondClick,
    setConfigPanelOpen,
    setFilterPanelOpen,
    setGraphState,
  });

  const value = useMemo<GraphContextType>(
    () => ({
      config,
      configPanelOpen,
      filters,
      filterPanelOpen,
      graphState: graphState.current,
      refreshGraphHighlights,
      setConfig,
      setConfigPanelOpen,
      setFilters,
      setFilterPanelOpen,
      setGraphState,
    }),
    [
      config,
      configPanelOpen,
      filters,
      filterPanelOpen,
      refreshGraphHighlights,
      setConfig,
      setConfigPanelOpen,
      setFilters,
      setFilterPanelOpen,
      setGraphState,
    ],
  );

  return (
    <GraphContext.Provider value={value}>{children}</GraphContext.Provider>
  );
};

export const useGraphContext = () => {
  const context = useContext(GraphContext);

  if (!context) {
    throw new Error("no GraphContext value has been provided");
  }

  return context;
};
