import "@react-sigma/core/lib/react-sigma.min.css";
import dynamic from "next/dynamic";
import { memo } from "react";

import type { GraphContainerProps } from "./graph-visualizer/graph-container";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./graph-visualizer/graph-container/shared/config-control";
import type { ReactElement } from "react";

export type { DynamicNodeSizing, GraphVizConfig, StaticNodeSizing };
export type { GraphVizFilters } from "./graph-visualizer/graph-container/shared/filter-control";
export type {
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer/graph-container/shared/types";

export type GraphVisualizerProps<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = GraphContainerProps<NodeSizing>;

/**
 * WebGL APIs aren't available on the server, so the Sigma-dependent container
 * is loaded dynamically with SSR off. Created at module scope: a `dynamic()`
 * call inside render makes a fresh component type per render, remounting the
 * whole graph.
 */
const GraphContainer = dynamic(
  () =>
    import("./graph-visualizer/graph-container").then(
      (module) => module.GraphContainer,
    ),
  { ssr: false },
) as unknown as <NodeSizing extends DynamicNodeSizing | StaticNodeSizing>(
  props: GraphContainerProps<NodeSizing>,
) => ReactElement | null;

export const GraphVisualizer = memo(
  <NodeSizing extends DynamicNodeSizing | StaticNodeSizing>(
    props: GraphVisualizerProps<NodeSizing>,
  ) => {
    return <GraphContainer {...props} />;
  },
);
