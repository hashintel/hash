import { useCallback } from "react";
import { useReactFlow } from "reactflow";

import { useEditorContext } from "./editor-context";
import { calculateGraphLayout } from "./lib/calculate-graph-layout";
import type { ArcType, NodeType } from "./types";

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

      void calculateGraphLayout({ nodes, arcs }).then((positions) => {
        mutatePetriNetDefinition((petriNet) => {
          const nodesById = petriNet.nodes.reduce(
            (acc, node) => {
              acc[node.id] = node;
              return acc;
            },
            {} as Record<string, NodeType>,
          );

          for (const { x, y, id } of positions) {
            const node = nodesById[id];

            if (!node) {
              continue;
            }
            node.position.x = x;
            node.position.y = y;
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
