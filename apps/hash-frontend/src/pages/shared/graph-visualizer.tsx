import "@react-sigma/core/lib/react-sigma.min.css";

import { MultiDirectedGraph } from "graphology";
import dynamic from "next/dynamic";
import { memo, useState } from "react";

import {
  FullScreenContextProvider,
  useFullScreen,
} from "./graph-visualizer/shared/full-screen";
import type { GraphLoaderProps } from "./graph-visualizer/graph-loader";

export type { GraphEdge, GraphNode } from "./graph-visualizer/graph-loader";

export type GraphVisualizerProps = Omit<GraphLoaderProps, "highlightDepth">;

const Graph = ({
  height,
  edges,
  nodes,
  onEdgeClick,
  onNodeClick,
}: GraphVisualizerProps & {
  height: number | string;
}) => {
  /**
   * When a node is hovered or selected, we highlight its neighbors up to this depth.
   *
   * Not currently exposed as a user setting but could be, thus the state.
   */
  const [highlightDepth, _setHighlightDepth] = useState(2);

  /**
   * WebGL APIs aren't available in the server, so we need to dynamically load any module which uses Sigma/graphology.
   */
  const SigmaContainer = dynamic(
    import("@react-sigma/core").then((module) => module.SigmaContainer),
    { ssr: false },
  );

  const TypesGraphLoader = dynamic(
    import("./graph-visualizer/graph-loader").then(
      (module) => module.GraphLoader,
    ),
    { ssr: false },
  );

  const FullScreenButton = dynamic(
    import("./graph-visualizer/full-screen-button").then(
      (module) => module.FullScreenButton,
    ),
    { ssr: false },
  );

  const { isFullScreen } = useFullScreen();

  return (
    <SigmaContainer
      graph={MultiDirectedGraph}
      style={{ height: isFullScreen ? "100vh" : height }}
    >
      <FullScreenButton />
      <TypesGraphLoader
        highlightDepth={highlightDepth}
        nodes={nodes}
        edges={edges}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
      />
    </SigmaContainer>
  );
};

export const GraphVisualizer = memo(
  (
    props: GraphVisualizerProps & {
      height: number | string;
    },
  ) => {
    /**
     * WebGL APIs aren't available in the server, so we need to dynamically load any module which uses Sigma/graphology.
     */
    if (typeof window !== "undefined") {
      return (
        <FullScreenContextProvider>
          <Graph {...props} />
        </FullScreenContextProvider>
      );
    }

    return null;
  },
);
