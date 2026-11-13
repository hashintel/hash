import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";

import { getStepNodeId } from "./flow-graph";
import { stepCardSize } from "./sizes";

import type { Viewport } from "@xyflow/react";

/**
 * Where to centre the view, at the same zoom, to bring a card wholly into the part of the canvas a panel doesn't cover;
 * `null` when it's there already.
 */
export const getCenterToReveal = (
  card: { x: number; y: number; width: number; height: number },
  viewport: Viewport,
  pane: { width: number; height: number },
  /** How much of the canvas's right edge a panel covers, in pixels. */
  coveredRight: number,
) => {
  const left = card.x * viewport.zoom + viewport.x;
  const top = card.y * viewport.zoom + viewport.y;

  return left < 0 ||
    top < 0 ||
    left + card.width * viewport.zoom > pane.width - coveredRight ||
    top + card.height * viewport.zoom > pane.height
    ? {
        x: card.x + card.width / 2 + coveredRight / 2 / viewport.zoom,
        y: card.y + card.height / 2,
      }
    : null;
};

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

    const viewport = getViewport();
    const center = getCenterToReveal(
      {
        ...node.internals.positionAbsolute,
        width: node.measured.width ?? stepCardSize.width,
        height: node.measured.height ?? stepCardSize.height,
      },
      viewport,
      { width: paneWidth, height: paneHeight },
      coveredRight,
    );

    if (center) {
      void setCenter(center.x, center.y, {
        zoom: viewport.zoom,
        duration: 300,
      });
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
