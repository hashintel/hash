import { useEffect, useState } from "react";
import type { ReactFlowInstance } from "reactflow";

import type { ArcData, ArcType, NodeData, NodeType } from "../types";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type SelectedArc = ArcType & { position: { x: number; y: number } };

/**
 * Hook to manage the UI state for the Petrinaut editor.
 * This includes selection state, dragging state, and ReactFlow instance.
 */
export const useEditorState = (nodes: NodeType[]) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  const [selectedPlacePosition, setSelectedPlacePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(
    null,
  );

  const [selectedArc, setSelectedArc] = useState<SelectedArc | null>(null);

  /**
   * While a node is being dragged, we don't want to keep reporting position changes to the consumer,
   * but we need to track the fact it's being dragged and where it is currently for reactflow to use.
   * This state tracks that information.
   */
  const [draggingStateByNodeId, setDraggingStateByNodeId] =
    useState<DraggingStateByNodeId>({});

  // Reset dragging state when nodes change
  useEffect(() => {
    setDraggingStateByNodeId({});
  }, [nodes]);

  const clearSelection = () => {
    setSelectedPlaceId(null);
    setSelectedPlacePosition(null);
    setSelectedArc(null);
    setSelectedTransition(null);
  };

  return {
    // ReactFlow instance
    reactFlowInstance,
    setReactFlowInstance,

    // Place selection
    selectedPlaceId,
    setSelectedPlaceId,
    selectedPlacePosition,
    setSelectedPlacePosition,

    // Transition selection
    selectedTransition,
    setSelectedTransition,

    // Arc selection
    selectedArc,
    setSelectedArc,

    // Dragging state
    draggingStateByNodeId,
    setDraggingStateByNodeId,

    // Utility
    clearSelection,
  };
};
