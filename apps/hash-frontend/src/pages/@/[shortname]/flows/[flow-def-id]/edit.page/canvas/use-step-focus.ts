import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { useEffect, useRef } from "react";

import { getStepNodeId } from "./flow-graph";
import { stepCardSize } from "./sizes";

/**
 * Pans to centre the step a focus request names, in the part of the canvas a panel doesn't cover. Retried as nodes
 * appear, until the step can be brought into view.
 */
export const useStepFocus = (
  /** A new object each time, so the same step can be focused twice. */
  focusRequest: { stepId: string } | null,
  /** How much of the canvas's right edge a panel covers, in pixels. */
  coveredRight: number,
) => {
  const { getInternalNode, getZoom, setCenter } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const focusedRequestRef = useRef<typeof focusRequest>(null);

  useEffect(() => {
    if (!focusRequest || focusedRequestRef.current === focusRequest) {
      return;
    }

    const node = getInternalNode(getStepNodeId(focusRequest.stepId));

    if (node) {
      focusedRequestRef.current = focusRequest;
      const { x, y } = node.internals.positionAbsolute;

      const zoom = getZoom();

      void setCenter(
        x +
          (node.measured.width ?? stepCardSize.width) / 2 +
          coveredRight / 2 / zoom,
        y + (node.measured.height ?? stepCardSize.height) / 2,
        { zoom, duration: 300 },
      );
    }
  }, [
    focusRequest,
    nodesInitialized,
    getInternalNode,
    getZoom,
    setCenter,
    coveredRight,
  ]);
};
