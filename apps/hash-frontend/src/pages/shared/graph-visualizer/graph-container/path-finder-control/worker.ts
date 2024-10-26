import { edgePathFromNodePath } from "graphology-shortest-path";
import { allSimplePaths } from "graphology-simple-path";
import { MultiDirectedGraph } from "graphology";

import type {
  GenerateSimplePathsParams,
  GenerateSimplePathsRequestMessage,
  GenerateSimplePathsResultMessage,
  Path,
} from "./types";

const generateSimplePaths = ({
  allowRepeatedNodeTypes,
  endNode,
  graph: serializedGraph,
  maxSimplePathDepth,
  simplePathSort,
  startNode,
  viaNode,
}: GenerateSimplePathsParams) => {
  const graph = new MultiDirectedGraph();
  graph.import(serializedGraph);

  const unfilteredSimplePaths = allSimplePaths(
    graph,
    startNode.nodeId,
    endNode.nodeId,
    { maxDepth: maxSimplePathDepth },
  );

  const pathOptions: Path[] = [];

  // eslint-disable-next-line no-labels
  pathsLoop: for (const path of unfilteredSimplePaths) {
    const seenTypes = new Set<string>();

    const labelParts: string[] = [];

    let hasGoneVia = !viaNode;

    for (const nodeId of path) {
      if (viaNode && nodeId === viaNode.nodeId) {
        hasGoneVia = true;
      }

      const nodeData = graph.getNodeAttributes(nodeId);

      if (!allowRepeatedNodeTypes && seenTypes.has(nodeData.nodeTypeId)) {
        /**
         * Excluding paths which travel through the same type of node twice is a simple way of path options down.
         */
        // eslint-disable-next-line no-labels
        continue pathsLoop;
      }

      labelParts.push(nodeData.label);

      seenTypes.add(nodeData.nodeTypeId);
    }

    if (hasGoneVia) {
      let significance = 0;

      if (simplePathSort === "Significance") {
        const edges = edgePathFromNodePath(graph, path);
        for (const edge of edges) {
          const edgeData = graph.getEdgeAttributes(edge);
          significance += edgeData.significance ?? 0;
        }
      }

      let prefix = "";
      if (simplePathSort === "Significance") {
        prefix = `[${significance}] `;
      } else if (simplePathSort === "Length") {
        prefix = `(${path.length - 1}) `;
      }

      const label = `${prefix}${labelParts.join(" —> ")}`;

      pathOptions.push({
        label,
        valueForSelector: label,
        nodePath: path,
        significance,
      });
    }
  }

  return pathOptions.sort((a, b) => {
    switch (simplePathSort) {
      case "Alphabetical":
        return a.label.localeCompare(b.label);
      case "Length":
        return a.nodePath.length - b.nodePath.length;
      case "Significance":
        return (b.significance ?? 0) - (a.significance ?? 0);
    }
    throw new Error(`Unknown simple path sort: ${simplePathSort}`);
  });
};

// eslint-disable-next-line no-restricted-globals
self.onmessage = ({ data }) => {
  if (
    "type" in data &&
    data.type ===
      ("generateSimplePaths" satisfies GenerateSimplePathsRequestMessage["type"])
  ) {
    const { params } = data as GenerateSimplePathsRequestMessage;
    const result = generateSimplePaths(params);
    console.log({ params, result });
    // eslint-disable-next-line no-restricted-globals
    self.postMessage({
      type: "generateSimplePathsResult",
      result,
    } satisfies GenerateSimplePathsResultMessage);
  }
};
