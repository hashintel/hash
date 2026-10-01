import { useEffect } from "react";

import { getBoundsOfCenteredBoxes } from "@hashintel/petrinaut-core";

import {
  fitViewportToBounds,
  getViewportRect,
  MAX_FIT_ZOOM,
} from "../views/SDCPN/canvas-viewport";

import type { CanvasInsets } from "../hooks/use-canvas-insets";
import type { CanvasController } from "../views/SDCPN/canvas-renderer";
import type { CanvasNode } from "../views/SDCPN/canvas-scene";
import type { Size } from "@hashintel/petrinaut-core";

/** Room left around the node, as a fraction of its size, so its arcs show too. */
const SHOW_PADDING = 4;
const SHOW_MIN_ZOOM = 0.4;

type Request =
  | { nodeId: string; mode: "show" | "reveal" }
  | { nodeId?: undefined; mode: "restore" | "keep" };

const listeners = new Set<(request: Request) => void>();

/** Asks the canvas to centre one node and zoom in on it. */
export const requestShowOnCanvas = (nodeId: string): void => {
  for (const listener of listeners) {
    listener({ nodeId, mode: "show" });
  }
};

/** Asks the canvas to pan a node into view, at the same zoom, when it is off screen. */
export const requestRevealOnCanvas = (nodeId: string): void => {
  for (const listener of listeners) {
    listener({ nodeId, mode: "reveal" });
  }
};

/**
 * After previews panned the canvas: "restore" goes back to the view before
 * the first pan, "keep" stays where the canvas is now.
 */
export const requestRestoreOnCanvas = (mode: "restore" | "keep"): void => {
  for (const listener of listeners) {
    listener({ mode });
  }
};

/** The view before a run of preview pans, for {@link requestRestoreOnCanvas}. */
let viewBeforePreview: ReturnType<CanvasController["getViewport"]> | null =
  null;

/** Answers {@link requestShowOnCanvas} and {@link requestRevealOnCanvas} for the renderer it runs in. */
export const useShowOnCanvasRequests = (
  controller: CanvasController,
  containerSize: Size,
  nodes: CanvasNode[],
  insets: CanvasInsets,
): void => {
  useEffect(() => {
    const show = (request: Request) => {
      if (request.mode === "restore" || request.mode === "keep") {
        if (request.mode === "restore" && viewBeforePreview) {
          controller.setViewport(viewBeforePreview, { animate: true });
        }
        viewBeforePreview = null;
        return;
      }
      const { nodeId, mode } = request;
      const node = nodes.find((candidate) => candidate.id === nodeId);
      const bounds = node ? getBoundsOfCenteredBoxes([node]) : null;
      if (!bounds) {
        return;
      }
      if (mode === "reveal") {
        const current = controller.getViewport();
        const visible = getViewportRect(containerSize, current, insets);
        const inView =
          bounds.x >= visible.x &&
          bounds.y >= visible.y &&
          bounds.x + bounds.width <= visible.x + visible.width &&
          bounds.y + bounds.height <= visible.y + visible.height;
        if (inView) {
          return;
        }
        viewBeforePreview ??= current;
        const { left } = insets;
        const width = containerSize.width - left - insets.right;
        const height = containerSize.height - insets.bottom;
        controller.setViewport(
          {
            zoom: current.zoom,
            x: left + width / 2 - (bounds.x + bounds.width / 2) * current.zoom,
            y: height / 2 - (bounds.y + bounds.height / 2) * current.zoom,
          },
          { animate: true },
        );
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
