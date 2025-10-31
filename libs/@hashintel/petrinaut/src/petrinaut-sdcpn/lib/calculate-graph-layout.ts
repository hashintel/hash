import type { ElkNode } from "elkjs";
import ELK from "elkjs";

import { nodeDimensions } from "../styling";
import type { ArcType, NodeType } from "../types";

/**
 * @see https://eclipse.dev/elk/documentation/tooldevelopers
 * @see https://rtsys.informatik.uni-kiel.de/elklive/json.html for JSON playground
 */
const elk = new ELK();

const graphPadding = 30;

/**
 * @see https://eclipse.dev/elk/reference.html
 */
const elkLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.algorithm": "layered",
  "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.direction": "RIGHT",
  "elk.padding": `[left=${graphPadding},top=${graphPadding},right=${graphPadding},bottom=${graphPadding}]`,
};

export type NodePosition = {
  id: string;
  x: number;
  y: number;
};

/**
 * Calculates the optimal layout positions for nodes in a Petri net graph using the ELK (Eclipse Layout Kernel) algorithm.
 *
 * This is a pure function that takes nodes and arcs as input and returns the calculated positions.
 * It does not mutate any state or trigger side effects.
 *
 * @param nodes - The nodes to layout
 * @param arcs - The arcs (edges) connecting the nodes
 * @returns A promise that resolves to an array of node positions
 */
export const calculateGraphLayout = async ({
  nodes,
  arcs,
}: {
  nodes: NodeType[];
  arcs: ArcType[];
}): Promise<NodePosition[]> => {
  if (nodes.length === 0) {
    return [];
  }

  const graph: ElkNode = {
    id: "root",
    children: JSON.parse(
      JSON.stringify(
        nodes.map((node) => ({
          ...node,
          /**
           * If we are loading a graph in full (e.g. from an example or PNML file), we need to set the visible width and height,
           * so that ELK knows how much space to reserve for the node.
           *
           * @todo encode width/height as part of the graph data
           */
          width: nodeDimensions[node.data.type].width,
          height: nodeDimensions[node.data.type].height,
        })),
      ),
    ) as ElkNode["children"],
    edges: JSON.parse(JSON.stringify(arcs)) as ElkNode["edges"],
    layoutOptions: elkLayoutOptions,
  };

  const updatedElements = await elk.layout(graph);

  /**
   * ELK inserts the calculated position as a root 'x' and 'y'.
   */
  const positions: NodePosition[] = [];
  for (const child of updatedElements.children ?? []) {
    if (child.x !== undefined && child.y !== undefined) {
      positions.push({
        id: child.id,
        x: child.x,
        y: child.y,
      });
    }
  }

  return positions;
};

/**
 * Applies the calculated positions to a set of nodes.
 * This is a pure function that returns a new array of nodes with updated positions.
 *
 * @param nodes - The original nodes
 * @param positions - The calculated positions
 * @returns A new array of nodes with updated positions
 */
export const applyLayoutPositions = (
  nodes: NodeType[],
  positions: NodePosition[],
): NodeType[] => {
  const positionsById = positions.reduce(
    (acc, pos) => {
      acc[pos.id] = pos;
      return acc;
    },
    {} as Record<string, NodePosition>,
  );

  return nodes.map((node) => {
    const position = positionsById[node.id];
    if (!position) {
      return node;
    }

    // Only update if position actually changed
    if (node.position.x === position.x && node.position.y === position.y) {
      return node;
    }

    return {
      ...node,
      position: {
        x: position.x,
        y: position.y,
      },
    };
  });
};
