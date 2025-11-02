import "reactflow/dist/style.css";

import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Connection, NodeChange, ReactFlowInstance } from "reactflow";
import ReactFlow, {
  Background,
  ConnectionLineType,
} from "reactflow";

import { applyNodeChanges } from "./apply-node-changes";
import { Arc } from "./arc";
import { generateUuid } from "./lib/generate-uuid";
import { PlaceNode } from "./place-node";
import { useEditorStore, useNodesWithDraggingState } from "./state/mod";
import { useSDCPNStore } from "./state/sdcpn-store";
import { nodeDimensions } from "./styling";
import { TransitionNode } from "./transition-node";
import type { ArcData, ArcType, NodeData, NodeType } from "./types";

type SDCPNViewProps = {
  /**
   * Nodes in PetriNetDefinitionObject format (for backward compatibility during transition)
   */
  nodes: NodeType[];
  /**
   * Arcs in PetriNetDefinitionObject format (for backward compatibility during transition)
   */
  arcs: ArcType[];
  /**
   * Callback when the pane (background) is clicked
   */
  onPaneClick?: () => void;
};

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from sdcpn-store and editor-store, and handles all ReactFlow interactions.
 * 
 * Note: Requires ReactFlowProvider to be present in a parent component.
 */
export const SDCPNView = ({
  nodes,
  arcs,
  onPaneClick,
}: SDCPNViewProps) => {
  const canvasContainer = useRef<HTMLDivElement>(null);

  // SDCPN store
  const reactFlowInstance = useSDCPNStore((state) => state.reactFlowInstance);
  const setReactFlowInstance = useSDCPNStore(
    (state) => state.setReactFlowInstance,
  );
  const updatePlacePosition = useSDCPNStore(
    (state) => state.updatePlacePosition,
  );
  const updateTransitionPosition = useSDCPNStore(
    (state) => state.updateTransitionPosition,
  );
  const addPlace = useSDCPNStore((state) => state.addPlace);
  const addTransition = useSDCPNStore((state) => state.addTransition);
  const addArc = useSDCPNStore((state) => state.addArc);

  // Editor state
  const draggingStateByNodeId = useEditorStore(
    (state) => state.draggingStateByNodeId,
  );
  const updateDraggingStateByNodeId = useEditorStore(
    (state) => state.updateDraggingStateByNodeId,
  );
  const resetDraggingState = useEditorStore(
    (state) => state.resetDraggingState,
  );

  const nodesForReactFlow = useNodesWithDraggingState(nodes);

  // Reset dragging state when nodes change
  useEffect(() => {
    resetDraggingState();
  }, [nodes, resetDraggingState]);

  const nodeTypes = useMemo(
    () => ({
      place: PlaceNode,
      transition: TransitionNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      default: Arc,
    }),
    [],
  );

  // Set initial viewport when reactFlowInstance is available
  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges({
        changes,
        draggingStateByNodeId,
        updatePlacePosition,
        updateTransitionPosition,
        updateDraggingStateByNodeId,
      });
    },
    [
      draggingStateByNodeId,
      updateDraggingStateByNodeId,
      updatePlacePosition,
      updateTransitionPosition,
    ],
  );

  const onEdgesChange = useCallback(() => {
    /**
     * There are no edge changes we need to process at the moment:
     * - We add arcs in onConnect, we won't don't process 'add'
     * - We don't allow removing arcs at the moment
     * - We handle selection in separate state when an edge is clicked
     * - Unclear what 'reset' is supposed to do
     */
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Places can only connect to transitions and vice versa
      return sourceNode.type !== targetNode.type;
    },
    [nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        return;
      }

      const source = connection.source ?? "";
      const target = connection.target ?? "";

      const sourceNode = nodes.find((node) => node.id === source);
      const targetNode = nodes.find((node) => node.id === target);

      if (!sourceNode || !targetNode) {
        return;
      }

      // Determine direction: place->transition or transition->place
      if (sourceNode.type === "place" && targetNode.type === "transition") {
        // Input arc: place to transition
        addArc(target, "input", source, 1);
      } else if (
        sourceNode.type === "transition" &&
        targetNode.type === "place"
      ) {
        // Output arc: transition to place
        addArc(source, "output", target, 1);
      }
    },
    [isValidConnection, nodes, addArc],
  );

  const onInit = useCallback(
    (instance: ReactFlowInstance<NodeData, ArcData>) => {
      setReactFlowInstance(instance);
    },
    [setReactFlowInstance],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!reactFlowInstance || !canvasContainer.current) {
        return;
      }

      const reactFlowBounds = canvasContainer.current.getBoundingClientRect();
      const nodeType = event.dataTransfer.getData("application/reactflow") as
        | "place"
        | "transition";

      const { width, height } = nodeDimensions[nodeType];

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left - width / 2,
        y: event.clientY - reactFlowBounds.top - height / 2,
      });

      const id = `${nodeType}__${generateUuid()}`;
      const label = `${nodeType} ${nodes.length + 1}`;

      if (nodeType === "place") {
        addPlace({
          id,
          name: label,
          dimensions: 1,
          differentialEquationCode: "",
          x: position.x,
          y: position.y,
          width,
          height,
        });
      } else {
        addTransition({
          id,
          name: label,
          inputArcs: [],
          outputArcs: [],
          lambdaCode: "",
          transitionKernelCode: "",
          x: position.x,
          y: position.y,
          width,
          height,
        });
      }
    },
    [reactFlowInstance, nodes.length, addPlace, addTransition],
  );

  const handlePaneClick = useCallback(() => {
    if (onPaneClick) {
      onPaneClick();
    }
  }, [onPaneClick]);

  return (
    <div
      ref={canvasContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <ReactFlow
        nodes={nodesForReactFlow}
        edges={arcs}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={handlePaneClick}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid
        snapGrid={[15, 15]}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={15} size={1} />
      </ReactFlow>
    </div>
  );
};
