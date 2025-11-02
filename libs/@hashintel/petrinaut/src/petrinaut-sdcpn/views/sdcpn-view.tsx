import "reactflow/dist/style.css";

import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection, ReactFlowInstance } from "reactflow";
import ReactFlow, {
  Background,
  ConnectionLineType,
  ReactFlowProvider,
} from "reactflow";

import { Arc } from "../arc";
import { useApplyNodeChanges } from "../hooks/use-apply-node-changes";
import { generateUuid } from "../lib/generate-uuid";
import { sdcpnToReactFlow } from "../lib/sdcpn-converters";
import { PlaceNode } from "../place-node";
import { useEditorStore, useNodesWithDraggingState } from "../state/mod";
import { useSDCPNStore } from "../state/sdcpn-store";
import { nodeDimensions } from "../styling";
import { TransitionNode } from "../transition-node";
import type { ArcData, NodeData } from "../types";

const SNAP_GRID_SIZE = 15;

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from sdcpn-store and editor-store, and handles all ReactFlow interactions.
 */
const SDCPNViewInner = () => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  // SDCPN store
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const addPlace = useSDCPNStore((state) => state.addPlace);
  const addTransition = useSDCPNStore((state) => state.addTransition);
  const addArc = useSDCPNStore((state) => state.addArc);

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format
  // Memoize to prevent creating new objects on every render
  const petriNetDefinition = useMemo(() => sdcpnToReactFlow(sdcpn), [sdcpn]);
  const { nodes, arcs } = petriNetDefinition;

  // Editor state
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const resetDraggingState = useEditorStore(
    (state) => state.resetDraggingState,
  );

  const nodesForReactFlow = useNodesWithDraggingState(nodes);

  // Reset dragging state when nodes change
  useEffect(() => {
    resetDraggingState();
  }, [nodes, resetDraggingState]);

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
    [],
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
        // eslint-disable-next-line no-console
        console.log("Adding place", id, label, position);
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
        // eslint-disable-next-line no-console
        console.log("Adding transition", id, label, position);
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
    clearSelection();
  }, [clearSelection]);

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
        nodeTypes={{
          place: PlaceNode,
          transition: TransitionNode,
        }}
        edgeTypes={{
          default: Arc,
        }}
        onNodesChange={applyNodeChanges}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={handlePaneClick}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={SNAP_GRID_SIZE} size={1} />
      </ReactFlow>
    </div>
  );
};

export const SDCPNView = () => {
  return (
    <ReactFlowProvider>
      <SDCPNViewInner />
    </ReactFlowProvider>
  );
};
