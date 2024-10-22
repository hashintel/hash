import type { PropsWithChildren, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalstorageState } from "rooks";

import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./config-control";
import type { GraphVizFilters } from "./filter-control";
import type { GraphState } from "./state";
import type { RegisterEventsArgs } from "./use-event-handlers";
import { useEventHandlers } from "./use-event-handlers";
import { useSetDrawSettings } from "./use-set-draw-settings";

export type GraphContextType<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = {
  config: GraphVizConfig<NodeSizing>;
  configPanelOpen: boolean;
  filters: GraphVizFilters;
  filterPanelOpen: boolean;
  graphContainerRef: RefObject<HTMLDivElement>;
  graphState: GraphState;
  refreshGraphHighlights: () => void;
  setConfig: (config: GraphVizConfig<NodeSizing>) => void;
  setConfigPanelOpen: (open: boolean) => void;
  setFilters: (filters: GraphVizFilters) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setGraphState: <K extends keyof GraphState>(
    key: K,
    value: GraphState[K],
  ) => void;
};

const GraphContext = createContext<GraphContextType<
  DynamicNodeSizing | StaticNodeSizing
> | null>(null);

export type GraphContextProviderProps<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = {
  defaultConfig: GraphVizConfig<NodeSizing>;
  defaultFilters?: GraphVizFilters;
  graphContainerRef: RefObject<HTMLDivElement>;
} & Pick<RegisterEventsArgs, "onEdgeClick" | "onNodeSecondClick" | "onRender">;

export const GraphContextProvider = <
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
>({
  children,
  defaultConfig,
  defaultFilters,
  graphContainerRef,
  onEdgeClick,
  onNodeSecondClick,
  onRender,
}: PropsWithChildren<GraphContextProviderProps<NodeSizing>>) => {
  const [config, setConfig] = useLocalstorageState<GraphVizConfig<NodeSizing>>(
    `graph-viz-config~${defaultConfig.graphKey}`,
    defaultConfig,
  );

  const [filters, setFilters] = useLocalstorageState<GraphVizFilters>(
    `graph-viz-filters~${defaultConfig.graphKey}`,
    defaultFilters ?? {},
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
    hoveredEdgeId: null,
    hoveredNodeId: null,
    highlightedEdgePath: null,
    neighborsByDepth: null,
    selectedNodeId: null,
  });

  const setGraphState: GraphContextType<NodeSizing>["setGraphState"] =
    useCallback((key, value) => {
      graphState.current[key] = value;
    }, []);

  useSetDrawSettings(graphState.current, config);

  const { refreshGraphHighlights } = useEventHandlers({
    config,
    graphContainerRef,
    graphState: graphState.current,
    onEdgeClick,
    onNodeSecondClick,
    onRender,
    setConfigPanelOpen,
    setFilterPanelOpen,
    setGraphState,
  });

  const value = useMemo<GraphContextType<NodeSizing>>(
    () => ({
      config,
      configPanelOpen,
      filters,
      filterPanelOpen,
      graphContainerRef,
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
      graphContainerRef,
      refreshGraphHighlights,
      setConfig,
      setConfigPanelOpen,
      setFilters,
      setFilterPanelOpen,
      setGraphState,
    ],
  );

  return (
    <GraphContext.Provider
      value={
        /**
         * this should be safe as the useMemo enforces the correct type, but ideally we wouldn't have to assert any type.
         * probably involves losing the generic or wrapping createContext in a function
         */
        value as unknown as GraphContextType<
          DynamicNodeSizing | StaticNodeSizing
        >
      }
    >
      {children}
    </GraphContext.Provider>
  );
};

export const useGraphContext = () => {
  const context = useContext(GraphContext);

  if (!context) {
    throw new Error("no GraphContext value has been provided");
  }

  return context;
};
