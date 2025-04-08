import { customColors } from "@hashintel/design-system/theme";
import { useLoadGraph, useSigma } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { memo, useEffect } from "react";

import { useGraphContext } from "./shared/graph-context";
import type { GraphVizEdge, GraphVizNode } from "./shared/types";
import type { RegisterEventsArgs } from "./shared/use-event-handlers";
import { useLayout } from "./use-layout";

export type GraphLoaderProps = {
  edges: GraphVizEdge[];
  nodes: GraphVizNode[];
} & Pick<RegisterEventsArgs, "onEdgeClick" | "onNodeSecondClick">;

export const GraphDataLoader = memo(({ edges, nodes }: GraphLoaderProps) => {
  /**
   * Hooks provided by the react-sigma library to simplify working with the sigma instance.
   */
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  const { config, filters } = useGraphContext();

  /**
   * Custom hooks for laying out the graph.
   */
  const layout = useLayout();

  useEffect(() => {
    const graph = new MultiDirectedGraph();

    const seenNodeIds = new Set<string>();

    for (const [index, node] of nodes.entries()) {
      if (
        node.nodeTypeId &&
        filters.includeByNodeTypeId?.[node.nodeTypeId] === false
      ) {
        continue;
      }

      const hasUrlImage =
        !!node.icon?.startsWith("http") ||
        !!node.icon?.startsWith("https://") ||
        node.icon?.startsWith("/");

      graph.addNode(node.nodeId, {
        borderColor: node.borderColor ?? node.color,
        /**
         * This color may be overwritten in the reducer {@link useSetDrawSettings}
         * We don't want this effect depending on the color options,
         * because we don't want to lay out the graph again if the color of nodes change.
         */
        color: node.color,
        x: index % 20,
        y: Math.floor(index / 20),
        iconColor: customColors.gray[10],
        image: node.icon,
        label: node.label,
        nodeId: node.nodeId,
        nodeTypeId: node.nodeTypeId,
        /**
         * We'll set this to 0 for now, and update it later when we have processed all the edges and sized the nodes.
         */
        significance: 0,
        size:
          config.nodeSizing.mode === "byEdgeCount"
            ? config.nodeSizing.min
            : node.size,
        type: hasUrlImage ? "icon" : "bordered",
      } satisfies GraphVizNode & {
        x: number;
        y: number;
        iconColor: string;
        image?: string | null;
        significance: number;
        type: "icon" | "bordered";
      });

      seenNodeIds.add(node.nodeId);
    }

    /**
     * We need to resize edges as we discover
     * (1) additional 'same source/target, same type' edges to aggregate under them
     * (2) additional edges pointing to them
     *
     * We'll do all that before adding it to the sigma graph to save repeatedly retrieving and updating it there.
     */
    const aggregateEdgesById: Record<
      string,
      GraphVizEdge & {
        aggregatedEdgeCount: number;
        aggregatedIncomingEdgeCount: number;
        color: string;
        significance: number;
        type: string;
      }
    > = {};

    /**
     * We take into account how many edges point to an edge as part of measuring its significance and thus size.
     *
     * Note that many graphs will not have any links to a link, this is currently expected to be a minority of cases.
     */
    const maybeEdgeIdToNumberOfIncomingEdges: Record<string, number> = {};

    /**
     * We aggregate edges of the same type between the same nodes into a single drawn edge.
     * This record keeps track of the edges aggregated under each aggregateEdgeId
     * – we need this to assign additional significance to edges that have more edges pointing to them.
     * We could alternatively offer the option to show them in parallel, which would work for a small number.
     */
    const aggregateEdgeToIndividualEdgeIds: Record<string, string[]> = {};

    for (const edge of edges) {
      const { source, target } = edge;

      if (!seenNodeIds.has(target)) {
        /**
         * The target might be a node that has been filtered out, or it might itself be an edge.
         *
         * We'll assume it's an edge for now. When we're adding significance to edges based on their incoming edges,
         * we will skip over any ids in this object that we haven't encountered an edge for.
         *
         * We don't know if we've encountered the target edge yet, if it is one, so we need to deal with these counts afterward.
         */
        maybeEdgeIdToNumberOfIncomingEdges[target] ??= 0;
        maybeEdgeIdToNumberOfIncomingEdges[target]++;

        /**
         * Don't do anything else for now because we don't want to draw this edge in the visualization.
         *
         * This assumes that we don't need to handle edges that point to THIS edge (i.e. edge -> edge -> edge)
         */
        continue;
      }

      if (!seenNodeIds.has(source)) {
        /**
         * The source of this edge is either a node that has been filtered out, or an edge.
         * We don't do anything with it in either case. We could offer the option for this to have some significance.
         */
        continue;
      }

      const aggregateEdgeId = `${source}-${target}`;
      aggregateEdgeToIndividualEdgeIds[aggregateEdgeId] ??= [];
      aggregateEdgeToIndividualEdgeIds[aggregateEdgeId].push(edge.edgeId);

      if (aggregateEdgesById[aggregateEdgeId]) {
        aggregateEdgesById[aggregateEdgeId].aggregatedEdgeCount++;
        aggregateEdgesById[aggregateEdgeId].significance++;
      } else {
        aggregateEdgesById[aggregateEdgeId] = {
          ...edge,
          edgeId: aggregateEdgeId,
          aggregatedEdgeCount: 1,
          aggregatedIncomingEdgeCount: 0,
          color: "rgba(180, 180, 180, 0.8)",
          significance: 1,
          type: "curved",
        };
      }
    }

    /**
     * The 'significance' of an edge will be the total of the number of edges it aggregates,
     * plus the number of edges that point to those edges (minus 1 – see calculation below).
     */
    let highestSignificance = -Infinity;
    let lowestSignificance = Infinity;

    /**
     * Now we've created all the edges, we can update the significance of the aggregated edges,
     * based on how many edges point to them.
     */
    for (const aggregatedEdge of Object.values(aggregateEdgesById)) {
      const individualEdges =
        aggregateEdgeToIndividualEdgeIds[aggregatedEdge.edgeId];

      for (const individualEdgeId of individualEdges ?? []) {
        const incomingEdges =
          maybeEdgeIdToNumberOfIncomingEdges[individualEdgeId];

        let significance = aggregatedEdge.significance;
        if (incomingEdges) {
          /**
           * We -1 to discount the first of the incoming edges pointing to this edge (which is one member of the aggregateEdge):
           * - we want to count the number of edges aggregated, plus the number of edges that point to each of those
           * - we already added 1 significance for each of the edges aggregated
           * - if we add 1 for each edge pointing to the edge, an individual edge with one incoming edge would have a significance of 2,
           *   and each further edge pointing to it would only increase the significance by 1.
           * - this overcounts the significance of the first edge pointing to that edge.
           */
          significance =
            aggregatedEdge.significance +
            (incomingEdges > 0 ? incomingEdges - 1 : 0);

          aggregatedEdge.significance = significance;
        }

        if (highestSignificance < significance) {
          highestSignificance = significance;
        }
        if (lowestSignificance > significance) {
          lowestSignificance = significance;
        }

        aggregatedEdge.aggregatedIncomingEdgeCount += incomingEdges ?? 0;
      }
    }

    /**
     * Now we know the range of edge counts and significance, we can set the size of the edges.
     */
    const edgeSignificanceRange = highestSignificance - lowestSignificance;

    const minEdgeSize = config.edgeSizing.min;
    const maxEdgeSize = config.edgeSizing.max;
    const maxEdgeSizeIncrease = maxEdgeSize - minEdgeSize;

    const nodeIdToTotalEdgeSignificance: Record<
      string,
      { In: number; Out: number; All: number }
    > = {};

    let edgeGeometricSizeFactor: number | undefined;
    if (config.edgeSizing.scale === "Geometric") {
      const edgeSignificanceRatio = highestSignificance / lowestSignificance;

      edgeGeometricSizeFactor =
        edgeSignificanceRatio === 1
          ? 1
          : (maxEdgeSize / minEdgeSize) **
            (1 / Math.log(edgeSignificanceRatio));
    }

    for (const aggregateEdge of Object.values(aggregateEdgesById)) {
      const { significance, source, target } = aggregateEdge;

      let size: number | undefined;
      if (config.edgeSizing.scale === "Linear") {
        const relativeSignificance =
          (significance - lowestSignificance) / edgeSignificanceRange;
        size = Math.floor(
          minEdgeSize + relativeSignificance * maxEdgeSizeIncrease,
        );
      } else {
        if (!edgeGeometricSizeFactor) {
          throw new Error("Expected edgeGeometricSizeFactor to be defined");
        }
        const normalizedSignificance = significance / lowestSignificance;
        size = Math.max(
          minEdgeSize,
          Math.floor(
            minEdgeSize *
              edgeGeometricSizeFactor ** Math.log(normalizedSignificance),
          ),
        );
      }

      graph.addEdge(source, target, {
        ...aggregateEdge,
        size,
      });

      nodeIdToTotalEdgeSignificance[source] ??= { In: 0, Out: 0, All: 0 };
      nodeIdToTotalEdgeSignificance[source].Out += significance;
      nodeIdToTotalEdgeSignificance[source].All += significance;

      nodeIdToTotalEdgeSignificance[target] ??= { In: 0, Out: 0, All: 0 };
      nodeIdToTotalEdgeSignificance[target].In += significance;
      nodeIdToTotalEdgeSignificance[target].All += significance;
    }

    if (config.nodeSizing.mode === "byEdgeCount") {
      const countKey = config.nodeSizing.countEdges;

      const countValues = Object.values(nodeIdToTotalEdgeSignificance).map(
        (counts) => counts[countKey],
      );

      const lowestCount = Math.min(...countValues);
      const highestCount = Math.max(...countValues);

      const range = highestCount - lowestCount;

      if (range === 0 && countValues.length === seenNodeIds.size) {
        /**
         * All nodes have the same count, so we don't need to resize any.
         */
      } else {
        const maxNodeSize = config.nodeSizing.max;
        const minNodeSize = config.nodeSizing.min;

        if (config.nodeSizing.scale === "Percentile") {
          /**
           * We have a different loop for Percentile scaling because we need to go through the counts in order,
           * rather than go through the nodes in whatever order they happened to have been assigned in.
           */
          const numberOfBuckets = 10;
          const percentileBucketSize = Math.ceil(
            countValues.length / numberOfBuckets,
          );
          const nodeIdAndSignificances = Object.entries(
            nodeIdToTotalEdgeSignificance,
          ).map(([nodeId, counts]) => ({
            nodeId,
            significance: counts[countKey],
          }));

          nodeIdAndSignificances.sort(
            (a, b) => a.significance - b.significance,
          );
          const percentileSizeIncrement =
            (maxNodeSize - minNodeSize) / (numberOfBuckets - 1);

          for (let i = 0; i < nodeIdAndSignificances.length; i++) {
            const { nodeId, significance } = nodeIdAndSignificances[i]!;
            graph.setNodeAttribute(nodeId, "significance", significance);

            const size =
              minNodeSize +
              Math.floor(i / percentileBucketSize) * percentileSizeIncrement;

            graph.setNodeAttribute(nodeId, "size", size);
          }
        } else {
          /**
           * Only bother to calculate these if we're using logarithmic or geometric scaling.
           */
          let logMin: number | undefined;
          let logRange: number | undefined;
          let geometricSizeFactor: number | undefined;

          if (config.nodeSizing.scale === "Logarithmic") {
            logMin = Math.log(lowestCount);
            const logMax = Math.log(highestCount);
            logRange = logMax - logMin;
          }

          if (config.nodeSizing.scale === "Geometric") {
            const countRatio = highestCount / lowestCount;
            geometricSizeFactor =
              countRatio === 1
                ? 1
                : (maxNodeSize / minNodeSize) ** (1 / Math.log(countRatio));
          }

          for (const [nodeId, significanceCounts] of Object.entries(
            nodeIdToTotalEdgeSignificance,
          )) {
            const aggregatedEdgeSignificance = significanceCounts[countKey];
            graph.setNodeAttribute(
              nodeId,
              "significance",
              aggregatedEdgeSignificance,
            );

            let size;

            const maxSizeIncrease = maxNodeSize - minNodeSize;

            switch (config.nodeSizing.scale) {
              case "Linear": {
                const relativeEdgeCount =
                  (aggregatedEdgeSignificance - lowestCount) / range;
                size = minNodeSize + relativeEdgeCount * maxSizeIncrease;
                break;
              }
              case "Logarithmic": {
                if (logMin === undefined || logRange === undefined) {
                  throw new Error(
                    "Logarithmic scaling requires logMin and logRange to be defined",
                  );
                }
                const logEdgeCount = Math.log(aggregatedEdgeSignificance);
                const normalizedLogCount = (logEdgeCount - logMin) / logRange;
                size = Math.floor(
                  minNodeSize + normalizedLogCount * maxSizeIncrease,
                );

                break;
              }
              case "Geometric": {
                if (geometricSizeFactor === undefined) {
                  throw new Error(
                    "Geometric scaling requires geometricSizeFactor to be defined",
                  );
                }

                const normalizedCount =
                  aggregatedEdgeSignificance / lowestCount;
                size = Math.floor(
                  minNodeSize *
                    geometricSizeFactor ** Math.log(normalizedCount),
                );

                break;
              }
            }

            graph.setNodeAttribute(nodeId, "size", size);
          }
        }
      }
    }

    loadGraph(graph);

    layout();
  }, [
    config.edgeSizing,
    /**
     * These are the config options that affect the layout and/or what nodes are included.
     * We exclude config.nodeHighlighting as it doesn't affect the graph, only what is highlighted on hover/click.
     * Re-rendering the graph without needing to lay it out again is handled in {@link ConfigControl}
     */
    config.nodeSizing,
    /**
     * We don't include filters.colorByNodeTypeId here because it doesn't affect the layout of the graph.
     * {@link FilterControl} handles re-rendering the graph when the colors change.
     */
    filters.includeByNodeTypeId,
    layout,
    loadGraph,
    sigma,
    nodes,
    edges,
  ]);

  return null;
});
