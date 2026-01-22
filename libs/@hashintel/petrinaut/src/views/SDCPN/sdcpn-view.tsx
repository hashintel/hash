import "reactflow/dist/style.css";

import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef, useState } from "react";
import type { Connection, Node, ReactFlowInstance } from "reactflow";
import ReactFlow, { Background, ConnectionLineType, MiniMap } from "reactflow";
import { v4 as generateUuid } from "uuid";

import { PANEL_MARGIN } from "../../constants/ui";
import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
} from "../../core/default-codes";
import { EditorContext } from "../../state/editor-context";
import { SDCPNContext } from "../../state/sdcpn-context";
import { useIsReadOnly } from "../../state/use-is-read-only";
import { Arc } from "./components/arc";
import { PlaceNode } from "./components/place-node";
import { TransitionNode } from "./components/transition-node";
import { useApplyNodeChanges } from "./hooks/use-apply-node-changes";
import { useSdcpnToReactFlow } from "./hooks/use-sdcpn-to-react-flow";
import type {
  ArcData,
  NodeData,
  PetrinautReactFlowInstance,
} from "./reactflow-types";
import { nodeDimensions } from "./styles/styling";

const SNAP_GRID_SIZE = 15;

const REACTFLOW_NODE_TYPES = {
  place: PlaceNode,
  transition: TransitionNode,
};

const REACTFLOW_EDGE_TYPES = {
  default: Arc,
};

const canvasContainerStyle = css({
  width: "[100%]",
  height: "[100%]",
  position: "relative",
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
});

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from SDCPNContext and EditorContext, and handles all ReactFlow interactions.
 */
export const SDCPNView: React.FC = () => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<PetrinautReactFlowInstance | null>(null);

  // SDCPN store
  const {
    petriNetId,
    addPlace,
    addTransition,
    addArc,
    deleteItemsByIds,
    readonly,
  } = use(SDCPNContext);

  const {
    editionMode,
    setEditionMode,
    selectedItemIds,
    setSelectedItemIds,
    setSelectedResourceId,
    clearSelection,
    visibleViewport,
  } = use(EditorContext);

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format with dragging state
  const { nodes, arcs } = useSdcpnToReactFlow();

  // Center viewport on SDCPN load
  useEffect(() => {
    reactFlowInstance?.fitView({ padding: 0.4, minZoom: 0.4, maxZoom: 1.1 });
  }, [reactFlowInstance, petriNetId]);

  // Readonly if simulation mode or readonly has been provided by external consumer.
  const isSimulationReadOnly = useIsReadOnly();
  const isReadonly = isSimulationReadOnly || readonly;

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
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
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

  function onNodeClick(_event: React.MouseEvent, node: Node<NodeData>) {
    // Set the selected resource ID for properties panel
    setSelectedResourceId(node.id);
    setSelectedItemIds(new Set([node.id]));
  }

  function onPaneClick(event: React.MouseEvent) {
    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    // Clear selection when clicking empty canvas in select mode
    if (editionMode === "select" || editionMode === "pan") {
      setSelectedItemIds(new Set());
      setSelectedResourceId(null);
      return;
    }

    // Only create nodes in add modes
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();

    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    const nodeType = event.dataTransfer.getData("application/reactflow");

    // Validate that we have a valid node type
    if (nodeType !== "place" && nodeType !== "transition") {
      return;
    }

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
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={canvasContainer}
      className={canvasContainerStyle}
      style={{
        // @ts-expect-error CSS variables work at runtime, but are not in the type system
        "--pane-cursor": getCursorStyle() as string,
      }}
      onKeyDown={({ key }) => {
        // Quick-and-dirty way to delete selected items with keyboard
        // with two different keys (Delete and Backspace), not possible with ReactFlow `deleteKeyCode` prop
        if ((key === "Delete" || key === "Backspace") && !isReadonly) {
          setSelectedResourceId(null);
          clearSelection();
          deleteItemsByIds(selectedItemIds);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={arcs}
        nodeTypes={REACTFLOW_NODE_TYPES}
        edgeTypes={REACTFLOW_EDGE_TYPES}
        onNodesChange={isReadonly ? undefined : applyNodeChanges}
        onEdgesChange={isReadonly ? undefined : applyNodeChanges}
        onConnect={isReadonly ? undefined : onConnect}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={(_e, edge) => {
          setSelectedResourceId(null);
          setSelectedItemIds(new Set([edge.id]));
        }}
        onDrop={isReadonly ? undefined : onDrop}
        onDragOver={isReadonly ? undefined : onDragOver}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
        panOnDrag={editionMode === "pan" ? true : isAddMode ? false : [1, 2]}
        nodesDraggable={!isReadonly}
        nodesConnectable={!isReadonly}
        elementsSelectable={!isReadonly && !isAddMode}
        selectNodesOnDrag={false}
        panOnScroll={false}
        zoomOnScroll
      >
        <Background gap={SNAP_GRID_SIZE} size={1} />
        <MiniMap
          style={{
            top: visibleViewport.top + PANEL_MARGIN,
            right: visibleViewport.right + PANEL_MARGIN,
            bottom: "auto",
            left: "auto",
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
};
