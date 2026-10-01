import { useEffect } from "react";

import { getBoundsOfCenteredBoxes } from "@hashintel/petrinaut-core";

import { fitViewportToBounds, MAX_FIT_ZOOM } from "../views/SDCPN/canvas-viewport";

import type { CanvasInsets } from "../hooks/use-canvas-insets";
import type { CanvasController } from "../views/SDCPN/canvas-renderer";
import type { CanvasNode } from "../views/SDCPN/canvas-scene";
import type { Size } from "@hashintel/petrinaut-core";

/** Room left around the node, as a fraction of its size, so its arcs show too. */
const SHOW_PADDING = 4;
const SHOW_MIN_ZOOM = 0.4;

const listeners = new Set<(nodeId: string) => void>();

/** Asks the canvas to centre one node and zoom in on it. */
export const requestShowOnCanvas = (nodeId: string): void => {
  for (const listener of listeners) {
    listener(nodeId);
  }
};

/** Answers {@link requestShowOnCanvas} for the renderer it runs in. */
export const useShowOnCanvasRequests = (
  controller: CanvasController,
  containerSize: Size,
  nodes: CanvasNode[],
  insets: CanvasInsets,
): void => {
  useEffect(() => {
    const show = (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      const bounds = node ? getBoundsOfCenteredBoxes([node]) : null;
      if (!bounds) {
        return;
      }
      controller.setViewport(
        fitViewportToBounds(
          bounds,
          containerSize,
          SHOW_MIN_ZOOM,
          MAX_FIT_ZOOM,
          SHOW_PADDING,
          insets,
        ),
        { animate: true },
      );
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
    };
  }, [controller, containerSize, nodes, insets]);
};
