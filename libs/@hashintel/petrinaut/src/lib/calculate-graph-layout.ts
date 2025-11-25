import type { ElkNode } from "elkjs";
import ELK from "elkjs";

import type { SDCPN } from "../core/types/sdcpn";
import { nodeDimensions } from "../views/SDCPN/styles/styling";

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
 * Calculates the optimal layout positions for nodes in an SDCPN graph using the ELK (Eclipse Layout Kernel) algorithm.
 *
 * This is a pure function that takes an SDCPN as input and returns the calculated positions.
 * It does not mutate any state or trigger side effects.
 *
 * @param sdcpn - The SDCPN to layout
 * @returns A promise that resolves to an array of node positions
 */
export const calculateGraphLayout = async (
  sdcpn: SDCPN,
): Promise<NodePosition[]> => {
  if (sdcpn.places.length === 0) {
    return [];
  }

  // Build ELK nodes from places and transitions
  const elkNodes: ElkNode["children"] = [
    ...sdcpn.places.map((place) => ({
      id: place.id,
      width: place.width ?? nodeDimensions.place.width,
      height: place.height ?? nodeDimensions.place.height,
    })),
    ...sdcpn.transitions.map((transition) => ({
      id: transition.id,
      width: transition.width ?? nodeDimensions.transition.width,
      height: transition.height ?? nodeDimensions.transition.height,
    })),
  ];

  // Build ELK edges from input and output arcs
  const elkEdges: ElkNode["edges"] = [];
  for (const transition of sdcpn.transitions) {
    // Input arcs: place -> transition
    for (const inputArc of transition.inputArcs) {
      elkEdges.push({
        id: `arc__${inputArc.placeId}-${transition.id}`,
        sources: [inputArc.placeId],
        targets: [transition.id],
      });
    }
    // Output arcs: transition -> place
    for (const outputArc of transition.outputArcs) {
      elkEdges.push({
        id: `arc__${transition.id}-${outputArc.placeId}`,
        sources: [transition.id],
        targets: [outputArc.placeId],
      });
    }
  }

  const graph: ElkNode = {
    id: "root",
    children: elkNodes,
    edges: elkEdges,
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
