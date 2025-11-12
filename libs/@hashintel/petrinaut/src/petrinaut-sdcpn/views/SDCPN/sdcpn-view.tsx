import "reactflow/dist/style.css";

import { css } from "@hashintel/ds-helpers/css";
import { useEffect, useRef, useState } from "react";
import type { Connection, ReactFlowInstance } from "reactflow";
import ReactFlow, { Background, ConnectionLineType } from "reactflow";
import { v4 as generateUuid } from "uuid";

import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
} from "../../core/default-codes";
import { useEditorStore } from "../../state/editor-provider";
import { useSDCPNStore } from "../../state/sdcpn-provider";
import type { ArcData, NodeData } from "../../state/types-for-editor-to-remove";
import { Arc } from "./components/arc";
import { PlaceNode } from "./components/place-node";
import { TransitionNode } from "./components/transition-node";
import { useApplyNodeChanges } from "./hooks/use-apply-node-changes";
import { useSdcpnToReactFlow } from "./hooks/use-sdcpn-to-react-flow";
import { nodeDimensions } from "./styles/styling";

const SNAP_GRID_SIZE = 15;

const REACTFLOW_NODE_TYPES = {
  place: PlaceNode,
  transition: TransitionNode,
};

const REACTFLOW_EDGE_TYPES = {
  default: Arc,
};

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from sdcpn-store and editor-store, and handles all ReactFlow interactions.
 */
export const SDCPNView: React.FC = () => {
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
  const deleteItemsByIds = useSDCPNStore((state) => state.deleteItemsByIds);

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format with dragging state
  const { nodes, arcs } = useSdcpnToReactFlow(sdcpn);

  // Editor state
  const mode = useEditorStore((state) => state.globalMode);
  const editionMode = useEditorStore((state) => state.editionMode);
  const setEditionMode = useEditorStore((state) => state.setEditionMode);
  const removeSelectedItemId = useEditorStore(
    (state) => state.removeSelectedItemId,
  );
  const setSelectedItemIds = useEditorStore(
    (state) => state.setSelectedItemIds,
  );

  // Center viewport on SDCPN load
  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.4, minZoom: 0.4, maxZoom: 1.1 });
    }
  }, [reactFlowInstance, sdcpn.id]);

  // Actual mode. When Simulate mode, edition mode is always "pan"
  const isReadonly = mode === "simulate";

  function isValidConnection(connection: Connection) {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);

    if (!sourceNode || !targetNode) {
      return false;
    }

    // Places can only connect to transitions and vice versa
    return sourceNode.type !== targetNode.type;
  }

  function onConnect(connection: Connection) {
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
  }

  function onInit(instance: ReactFlowInstance<NodeData, ArcData>) {
    setReactFlowInstance(instance);
  }

  // Shared function to create a node at a given position
  function createNodeAtPosition(
    nodeType: "place" | "transition",
    position: { x: number; y: number },
  ) {
    const { width, height } = nodeDimensions[nodeType];

    const id = `${nodeType}__${generateUuid()}`;
    const itemNumber = nodes.length + 1;

    if (nodeType === "place") {
      addPlace({
        id,
        name: `Place${itemNumber}`,
        type: null,
        dynamicsEnabled: false,
        differentialEquationCode: null,
        x: position.x,
        y: position.y,
        width,
        height,
        visualizerCode: undefined,
      });
    } else {
      addTransition({
        id,
        name: `Transition${itemNumber}`,
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: generateDefaultLambdaCode("predicate"),
        transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
        x: position.x,
        y: position.y,
        width,
        height,
      });
    }
    setSelectedItemIds(new Set([id]));
    setEditionMode("select");
  }

  function onPaneClick(event: React.MouseEvent) {
    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    // Clear selection when clicking empty canvas in select mode
    if (editionMode === "select") {
      setSelectedItemIds(new Set());
      return;
    }

    // Only create nodes in add modes
    if (editionMode !== "add-place" && editionMode !== "add-transition") {
      return;
    }

    const nodeType = editionMode === "add-place" ? "place" : "transition";
    const { width, height } = nodeDimensions[nodeType];

    const reactFlowBounds = canvasContainer.current.getBoundingClientRect();
    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left - width / 2,
      y: event.clientY - reactFlowBounds.top - height / 2,
    });

    createNodeAtPosition(nodeType, position);
  }

  // Prevent ReactFlow from capturing keyboard events when in Monaco editor
  // TODO: This is messy and we should find a better way to handle keyboard shortcuts and collisions.
  useEffect(() => {
    function preventReactFlowKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isInMonaco = target.closest(".monaco-editor") !== null;

      if (isInMonaco) {
        // Only stop propagation for keys that ReactFlow captures
        // ReactFlow uses: Space (pan), Shift (selection), but we want to allow:
        // - Cmd/Ctrl+Z (undo)
        // - Cmd/Ctrl+Shift+Z (redo)
        // - Cmd/Ctrl+C/V/X (copy/paste/cut)
        // - and other editor shortcuts

        // Don't stop propagation if modifier keys are pressed (for editor shortcuts)
        if (event.metaKey || event.ctrlKey) {
          return;
        }

        // Stop propagation for keys that would interfere with Monaco
        // Primarily Space, which ReactFlow uses for panning
        if (event.key === " " || event.key === "Spacebar") {
          event.stopPropagation();
        }
      }
    }

    // Use capture phase to intercept before ReactFlow
    document.addEventListener("keydown", preventReactFlowKeyboard, true);
    return () => {
      document.removeEventListener("keydown", preventReactFlowKeyboard, true);
    };
  }, []);

  // Determine ReactFlow props based on edition mode
  const isAddMode =
    editionMode === "add-place" || editionMode === "add-transition";
  const isPanMode = editionMode === "pan";

  // Set cursor style based on mode
  const getCursorStyle = () => {
    if (isAddMode) {
      return "copy";
    }
    if (isPanMode) {
      return "grab";
    }
    return "default";
  };

  return (
    <div
      ref={canvasContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        // @ts-expect-error CSS variables work at runtime, but are not in the type system
        "--pane-cursor": getCursorStyle() as string,
      }}
      className={css({
        "& .react-flow__pane": {
          cursor: `var(--pane-cursor) !important`,
        },
      })}
    >
      <ReactFlow
        nodes={nodes}
        edges={arcs}
        nodeTypes={REACTFLOW_NODE_TYPES}
        onNodesDelete={(rfNodes) => {
          for (const node of rfNodes) {
            removeSelectedItemId(node.id);
          }
          deleteItemsByIds(new Set(rfNodes.map((node) => node.id)));
        }}
        edgeTypes={REACTFLOW_EDGE_TYPES}
        onEdgesDelete={(rfEdges) => {
          for (const edge of rfEdges) {
            removeSelectedItemId(edge.id);
          }
          deleteItemsByIds(new Set(rfEdges.map((edge) => edge.id)));
        }}
        onNodesChange={isReadonly ? undefined : applyNodeChanges}
        onEdgesChange={isReadonly ? undefined : applyNodeChanges}
        onConnect={isReadonly ? undefined : onConnect}
        onInit={onInit}
        onPaneClick={onPaneClick}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
        panOnDrag={editionMode === "pan" ? true : isAddMode ? false : [1, 2]}
        nodesDraggable={!isReadonly}
        nodesConnectable={!isReadonly}
        elementsSelectable={!isAddMode}
        selectionOnDrag={editionMode === "select"}
        panOnScroll={false}
        zoomOnScroll
      >
        <Background gap={SNAP_GRID_SIZE} size={1} />
      </ReactFlow>
    </div>
  );
};
