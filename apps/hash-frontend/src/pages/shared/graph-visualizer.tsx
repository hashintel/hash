import "@react-sigma/core/lib/react-sigma.min.css";

import dynamic from "next/dynamic";
import { memo } from "react";

import type { GraphContainerProps } from "./graph-visualizer/graph-container";

export type {
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer/graph-container/graph-data-loader";

export type GraphVisualizerProps = GraphContainerProps;

export const GraphVisualizer = memo((props: GraphVisualizerProps) => {
  if (typeof window !== "undefined") {
    /**
     * WebGL APIs aren't available in the server, so we need to dynamically load any module which uses Sigma/graphology.
     */
    const GraphContainer = dynamic(
      import("./graph-visualizer/graph-container").then(
        (module) => module.GraphContainer,
      ),
      { ssr: false },
    );

    return <GraphContainer {...props} />;
  }

  return null;
});
