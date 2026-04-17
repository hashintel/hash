import type { PetrinautReactFlowInstance, NodeType } from "../reactflow-types";
import { use, useEffect, useRef } from "react";

import { recenterToFitViewport, getViewportRect } from "../../../lib/viewport";
import { EditorContext } from "../../../state/editor-context";
import { parseArcId } from "../../../state/selection";

const RE_CENTER_PADDING = 20;

/**
 * When the bottom panel or properties panel opens with selected nodes,
 * check whether those nodes are still visible in the reduced viewport
 * and pan to bring them into view if needed.
 */
export function useRecenterOnPanelOpen(
  canvasRef: React.RefObject<HTMLElement | null>,
  reactFlowInstance: PetrinautReactFlowInstance | null,
  nodes: NodeType[],
) {
  const {
    isBottomPanelOpen,
    isLeftSidebarOpen,
    leftSidebarWidth,
    bottomPanelHeight,
    hasSelection,
    selection,
    propertiesPanelWidth,
  } = use(EditorContext);

  const prevLeftSidebarOpen = useRef(isLeftSidebarOpen);
  const prevBottomPanelOpen = useRef(isBottomPanelOpen);
  const prevHasSelection = useRef(hasSelection);

  useEffect(() => {
    const leftJustOpened = isLeftSidebarOpen && !prevLeftSidebarOpen.current;
    const bottomJustOpened = isBottomPanelOpen && !prevBottomPanelOpen.current;
    const propertiesJustOpened = hasSelection && !prevHasSelection.current;

    prevLeftSidebarOpen.current = isLeftSidebarOpen;
    prevBottomPanelOpen.current = isBottomPanelOpen;
    prevHasSelection.current = hasSelection;

    if (!reactFlowInstance) return;
    if (!canvasRef.current) return;
    if (!bottomJustOpened && !propertiesJustOpened && !leftJustOpened) return;
    if (selection.size === 0) return;

    const selectedNodeIds = new Set<string>();
    for (const item of selection.values()) {
      if (item.type === "arc") {
        const parsed = parseArcId(item.id);
        if (parsed) {
          selectedNodeIds.add(parsed.sourceId);
          selectedNodeIds.add(parsed.targetId);
        }
      } else if (item.type === "place" || item.type === "transition") {
        selectedNodeIds.add(item.id);
      }
    }

    const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
    if (selectedNodes.length === 0) return;

    const originalViewport = reactFlowInstance.getViewport();
    const viewport = getViewportRect(canvasRef.current, originalViewport, {
      left: isLeftSidebarOpen ? leftSidebarWidth : 0,
      bottom: isBottomPanelOpen ? bottomPanelHeight : 0,
      right: hasSelection ? propertiesPanelWidth : 0,
    });

    const adjustment = recenterToFitViewport(
      reactFlowInstance,
      viewport,
      selectedNodes,
    );

    if (adjustment && (adjustment.x !== 0 || adjustment.y !== 0)) {
      const paddingX =
        adjustment.x === 0
          ? 0
          : adjustment.x < 0
            ? RE_CENTER_PADDING * -1
            : RE_CENTER_PADDING;
      const paddingY =
        adjustment.y === 0
          ? 0
          : adjustment.y < 0
            ? RE_CENTER_PADDING * -1
            : RE_CENTER_PADDING;
      // adjustment is in flow coordinates; convert to screen pixels for the viewport transform
      reactFlowInstance
        .setViewport({
          x: originalViewport.x - paddingX - adjustment.x * viewport.zoom,
          y: originalViewport.y - paddingY - adjustment.y * viewport.zoom,
          zoom: viewport.zoom,
        })
        .catch(() => {});
    }
  }, [
    isBottomPanelOpen,
    bottomPanelHeight,
    leftSidebarWidth,
    isLeftSidebarOpen,
    hasSelection,
    selection,
    propertiesPanelWidth,
    nodes,
    reactFlowInstance,
  ]);
}
