import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
import { useCallback } from "react";
import { useReactFlow } from "reactflow";

import { useEditorContext } from "./editor-context";
import { nodeDimensions } from "./styling";
import type { ArcType, NodeType } from "./types";

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
  "elk.padding": `[left=${graphPadding},top=${
    graphPadding
  },right=${graphPadding},bottom=${graphPadding}]`,
};

export const useLayoutGraph = () => {
  const { fitView } = useReactFlow();

  const { mutatePetriNetDefinition } = useEditorContext();

  const layoutGraph = useCallback(
    ({
      nodes,
      arcs,
      animationDuration,
    }: {
      nodes: NodeType[];
      arcs: ArcType[];
      animationDuration: number;
    }) => {
      if (nodes.length === 0) {
        return;
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
        ),
        edges: JSON.parse(JSON.stringify(arcs)),
        layoutOptions: elkLayoutOptions,
      };

      void elk.layout(graph).then((updatedElements) => {
        mutatePetriNetDefinition((petriNet) => {
          const nodesById = petriNet.nodes.reduce(
            (acc, node) => {
              acc[node.id] = node;
              return acc;
            },
            {} as Record<string, NodeType>,
          );

          /**
           * ELK inserts the calculated position as a root 'x' and 'y'.
           */
          for (const { x, y, id } of updatedElements.children ?? []) {
            const node = nodesById[id];

            if (!node) {
              continue;
            }

            if (x && node.position.x !== x) {
              node.position.x = x;
            }

            if (y && node.position.y !== y) {
              node.position.y = y;
            }
          }
        });

        setTimeout(
          () =>
            window.requestAnimationFrame(() =>
              fitView({
                duration: animationDuration,
                padding: 0.03,
                maxZoom: 1,
              }),
            ),
          300,
        );
      });
    },
    [mutatePetriNetDefinition, fitView],
  );

  return layoutGraph;
};
