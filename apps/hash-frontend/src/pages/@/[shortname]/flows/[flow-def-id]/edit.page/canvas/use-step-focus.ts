import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";
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

/** Brings the one step selected into view when it's partly out of view, or under a panel, e.g. one just opened. */
export const useSelectedStepInView = (
  selectedStepIds: string[],
  /** How much of the canvas's right edge a panel covers, in pixels. */
  coveredRight: number,
) => {
  const { getInternalNode, getViewport, setCenter } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  const soleSelectedStepId =
    selectedStepIds.length === 1 ? selectedStepIds[0] : undefined;

  useEffect(() => {
    const node = soleSelectedStepId
      ? getInternalNode(getStepNodeId(soleSelectedStepId))
      : undefined;

    if (!node) {
      return;
    }

    const { x, y } = node.internals.positionAbsolute;
    const width = node.measured.width ?? stepCardSize.width;
    const height = node.measured.height ?? stepCardSize.height;
    const viewport = getViewport();
    const left = x * viewport.zoom + viewport.x;
    const top = y * viewport.zoom + viewport.y;

    if (
      left < 0 ||
      top < 0 ||
      left + width * viewport.zoom > paneWidth - coveredRight ||
      top + height * viewport.zoom > paneHeight
    ) {
      void setCenter(
        x + width / 2 + coveredRight / 2 / viewport.zoom,
        y + height / 2,
        { zoom: viewport.zoom, duration: 300 },
      );
    }
  }, [
    soleSelectedStepId,
    paneWidth,
    paneHeight,
    coveredRight,
    /* A step just added is measured after it's selected. */
    nodesInitialized,
    getInternalNode,
    getViewport,
    setCenter,
  ]);
};
