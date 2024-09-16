import type { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { useLoadGraph } from "@react-sigma/core";
import { useEffect } from "react";
import Graph from "graphology";

export type TypesGraphProps = {
  subgraph: Subgraph<EntityTypeRootType>;
};

export const TypesGraphLoader = ({ subgraph }: TypesGraphProps) => {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    const graph = new Graph();
    graph.addNode("A", { x: 0, y: 0, label: "Node A", size: 10 });
    graph.addNode("B", { x: 1, y: 1, label: "Node B", size: 10 });
    graph.addEdgeWithKey("rel1", "A", "B", { label: "REL_1" });
    graph.addEdgeWithKey("rel2", "A", "B", { label: "REL_2" });

    loadGraph(graph);
  }, [loadGraph]);

  return null;
};
