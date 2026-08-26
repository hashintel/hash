import { useReactFlow } from "@xyflow/react";
import { use, useEffect, useRef } from "react";

import { parseArcId } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../react/state/editor-context";
import { recenterToFitViewport, getViewportRect } from "../../../lib/viewport";

import type { ArcEdgeType, NodeType } from "../reactflow-types";
import type { Size } from "@hashintel/petrinaut-core";

const RE_CENTER_PADDING = 20;

/**
 * When the bottom panel or properties panel opens with selected nodes,
 * check whether those nodes are still visible in the reduced viewport
 * and pan to bring them into view if needed.
 */
export function useRecenterOnPanelOpen(containerSize: Size, nodes: NodeType[]) {
  const reactFlow = useReactFlow<NodeType, ArcEdgeType>();
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

    const originalViewport = reactFlow.getViewport();
    const viewport = getViewportRect(containerSize, originalViewport, {
      left: isLeftSidebarOpen ? leftSidebarWidth : 0,
      bottom: isBottomPanelOpen ? bottomPanelHeight : 0,
      right: hasSelection ? propertiesPanelWidth : 0,
    });

    const adjustment = recenterToFitViewport(viewport, selectedNodes);

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
      reactFlow
        .setViewport({
          x: originalViewport.x - paddingX - adjustment.x * viewport.zoom,
          y: originalViewport.y - paddingY - adjustment.y * viewport.zoom,
          zoom: viewport.zoom,
        })
        .catch(() => {});
    }
  }, [
    containerSize,
    isBottomPanelOpen,
    bottomPanelHeight,
    leftSidebarWidth,
    isLeftSidebarOpen,
    hasSelection,
    selection,
    propertiesPanelWidth,
    nodes,
    reactFlow,
  ]);
}
