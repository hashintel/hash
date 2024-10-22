import "@react-sigma/core/lib/react-sigma.min.css";

import dynamic from "next/dynamic";
import { memo } from "react";

import type { GraphContainerProps } from "./graph-visualizer/graph-container";
import type {
  DynamicNodeSizing,
  StaticNodeSizing,
} from "./graph-visualizer/graph-container/shared/config-control";

export type {
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer/graph-container/graph-data-loader";

export type GraphVisualizerProps<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = GraphContainerProps<NodeSizing>;

export const GraphVisualizer = memo(
  <NodeSizing extends DynamicNodeSizing | StaticNodeSizing>(
    props: GraphVisualizerProps<NodeSizing>,
  ) => {
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
  },
);
