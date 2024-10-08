import type { PropsWithChildren } from "react";
import { useRef, createContext, useCallback, useContext, useMemo } from "react";
import { useLocalstorageState } from "rooks";
import type { GraphVizConfig } from "./config-control";
import type { GraphState } from "./state";
import { useEventHandlers } from "./use-event-handlers";
import { useSetDrawSettings } from "./use-set-draw-settings";

export type GraphContextType = {
  config: GraphVizConfig;
  graphState: GraphState;
  refreshGraphHighlights: () => void;
  setConfig: (config: GraphVizConfig) => void;
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

  /**
   * State to track interactions with the graph.
   * It's drawn in canvas so doesn't need to be in React state
   * – redrawing the graph is done via sigma.refresh.
   */
  const graphState = useRef<GraphState>({
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
    setGraphState,
  });

  const value = useMemo<GraphContextType>(
    () => ({
      config,
      setConfig,
      graphState: graphState.current,
      setGraphState,
      refreshGraphHighlights,
    }),
    [config, refreshGraphHighlights, setConfig, setGraphState],
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
