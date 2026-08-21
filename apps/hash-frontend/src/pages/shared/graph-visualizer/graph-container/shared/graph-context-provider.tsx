import { useLocalStorage } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";

import { GraphContext } from "./graph-context";
import { useEventHandlers } from "./use-event-handlers";
import { useSetDrawSettings } from "./use-set-draw-settings";

import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./config-control";
import type { GraphVizFilters } from "./filter-control";
import type { GraphContextType } from "./graph-context";
import type { GraphState } from "./state";
import type { RegisterEventsArgs } from "./use-event-handlers";
import type { PropsWithChildren, RefObject } from "react";

export type GraphContextProviderProps<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = {
  defaultConfig: GraphVizConfig<NodeSizing>;
  defaultFilters?: GraphVizFilters;
  graphContainerRef: RefObject<HTMLDivElement | null>;
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
  const [config, setConfig] = useLocalStorage<GraphVizConfig<NodeSizing>>({
    key: `graph-viz-config~${defaultConfig.graphKey}`,
    defaultValue: defaultConfig,
    getInitialValueInEffect: false,
  });

  const [filters, setFilters] = useLocalStorage<GraphVizFilters>({
    key: `graph-viz-filters~${defaultConfig.graphKey}`,
    defaultValue: defaultFilters ?? {},
    getInitialValueInEffect: false,
  });

  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [pathFinderPanelOpen, setPathFinderPanelOpen] = useState(false);

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
    pathFinderPanelOpen,
    setConfigPanelOpen,
    setFilterPanelOpen,
    setPathFinderPanelOpen,
    setSearchPanelOpen,
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
      pathFinderPanelOpen,
      refreshGraphHighlights,
      searchPanelOpen,
      setConfig,
      setConfigPanelOpen,
      setFilters,
      setFilterPanelOpen,
      setGraphState,
      setPathFinderPanelOpen,
      setSearchPanelOpen,
    }),
    [
      config,
      configPanelOpen,
      filters,
      filterPanelOpen,
      graphContainerRef,
      pathFinderPanelOpen,
      refreshGraphHighlights,
      searchPanelOpen,
      setConfig,
      setFilters,
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
