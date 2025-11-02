import { useCallback } from "react";

import { calculateGraphLayout } from "./lib/calculate-graph-layout";
import { useSDCPNStore } from "./state/sdcpn-store";
import type { ArcType, NodeType } from "./types";

export const useLayoutGraph = () => {
  const reactFlowInstance = useSDCPNStore((state) => state.reactFlowInstance);
  const updatePlacePosition = useSDCPNStore(
    (state) => state.updatePlacePosition,
  );
  const updateTransitionPosition = useSDCPNStore(
    (state) => state.updateTransitionPosition,
  );

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
        for (const { x, y, id } of positions) {
          if (id.startsWith("place__")) {
            updatePlacePosition(id, x, y);
          } else if (id.startsWith("transition__")) {
            updateTransitionPosition(id, x, y);
          }
        }

        if (reactFlowInstance) {
          setTimeout(
            () =>
              window.requestAnimationFrame(() =>
                reactFlowInstance.fitView({
                  duration: animationDuration,
                  padding: 0.03,
                  maxZoom: 1,
                }),
              ),
            300,
          );
        }
      });
    },
    [updatePlacePosition, updateTransitionPosition, reactFlowInstance],
  );

  return layoutGraph;
};
