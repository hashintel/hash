import {
  Background,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { use, useEffect, useState } from "react";
import { v4 as generateUuid } from "uuid";

import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../react";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { SNAP_GRID_SIZE } from "../../constants/ui";
import { snapPositionToGrid } from "../../lib/snap-position-to-grid";
import { getInitialViewport } from "../../lib/viewport";
import { Arc } from "./components/arc";
import { ClassicPlaceNode } from "./components/classic-place-node";
import { ClassicTransitionNode } from "./components/classic-transition-node";
import { ComponentInstanceNode } from "./components/component-instance-node";
import { MiniMap } from "./components/mini-map";
import { PlaceNode } from "./components/place-node";
import { TransitionNode } from "./components/transition-node";
import { ViewportControls } from "./components/viewport-controls";
import { useApplyNodeChanges } from "./hooks/use-apply-node-changes";
import { useRecenterOnPanelOpen } from "./hooks/use-recenter-on-panel-open";
import { useSdcpnToReactFlow } from "./hooks/use-sdcpn-to-react-flow";
import { useDebouncedValue } from "./hooks/util/use-debounced-value";

import type { ViewportAction } from "../../types/viewport-action";
import type { ArcEdgeType, NodeType } from "./reactflow-types";
import type { Size } from "@hashintel/petrinaut-core";
import type { Connection } from "@xyflow/react";

/**
 * Converts a free-form subnet display name to a valid PascalCase instance name.
 * Splits on non-alphanumeric boundaries, capitalises each letter-starting word,
 * and appends a trailing numeric suffix if present.
 * "Hospital Ward" → "HospitalWard", "Subnet 1" → "Subnet1", "Coal Plant" → "CoalPlant"
 * Falls back to "Instance" when the result would not satisfy PascalCase.
 */
const toInstanceName = (subnetName: string): string => {
  const words = subnetName
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  const letterParts: string[] = [];
  let trailingNumber = "";

  for (const word of words) {
    if (/^\d+$/.test(word)) {
      trailingNumber = word;
    } else {
      const letters = word.replace(/[^a-zA-Z]/g, "");
      if (letters) {
        trailingNumber = "";
        letterParts.push(letters[0]!.toUpperCase() + letters.slice(1));
      }
    }
  }

  const result = letterParts.join("") + trailingNumber;
  return /^[A-Z][a-zA-Z]*\d*$/.test(result) ? result : "Instance";
};

const COMPACT_NODE_TYPES = {
  place: PlaceNode,
  transition: TransitionNode,
  componentInstance: ComponentInstanceNode,
};

const CLASSIC_NODE_TYPES = {
  place: ClassicPlaceNode,
  transition: ClassicTransitionNode,
  componentInstance: ComponentInstanceNode,
};

const REACTFLOW_EDGE_TYPES = {
  default: Arc,
};

const MIN_ZOOM_DEBOUNCE_MS = 100;

const fadeBgStyle = css({
  position: "absolute",
  inset: "[0]",
  background: "[rgba(255, 255, 255, 0.3)]",
  pointerEvents: "none",
});

/**
 * SDCPNCanvas renders the net with ReactFlow and handles all ReactFlow
 * interactions. It only mounts once the canvas container has been measured,
 * so its very first render already shows the net centered in the viewport.
 * Remounting it (via a `key`) re-centers on the current net.
 */
export const SDCPNCanvas: React.FC<{
  /** Settled size of the canvas container (see `useContainerSize`). */
  containerSize: Size;
  viewportActions?: ViewportAction[];
}> = ({ containerSize, viewportActions }) => {
  const reactFlow = useReactFlow<NodeType, ArcEdgeType>();

  const { compactNodes, showMinimap, snapToGrid, partialSelection } =
    use(UserSettingsContext);
  const nodeTypes = compactNodes ? COMPACT_NODE_TYPES : CLASSIC_NODE_TYPES;

  const { petriNetDefinition } = use(SDCPNContext);
  const { addPlace, addTransition, addArc, addComponentInstance } =
    usePetrinautMutations();

  const {
    editionMode,
    setEditionMode,
    componentSubnetId,
    cursorMode,
    selectItem,
    clearSelection,
    hasCanvasSelection,
    setHoveredItem,
    clearHoveredItem,
    globalMode,
  } = use(EditorContext);
  const isActualMode = globalMode === "actual";

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format with dragging state
  const { nodes, edges } = useSdcpnToReactFlow();

  // When a panel opens, recenter the viewport to keep selected nodes visible
  useRecenterOnPanelOpen(containerSize, nodes);

  const bounds = getBoundsOfCenteredBoxes(nodes);

  // The viewport at mount, centered on the net. ReactFlow owns the viewport
  // from then on, so later bounds or container changes must not recompute it.
  const [initialViewport] = useState(() =>
    getInitialViewport(bounds, containerSize),
  );

  // The min zoom (ie the max you can zoom out to) keeps the net at a readable
  // fraction of the viewport.
  const boundsMinZoom = getMinZoomForBounds(bounds, containerSize);

  // Never raise the zoom floor above the user's current zoom — deleting nodes
  // shrinks the bounds and could otherwise push the floor past the viewport.
  // Subscribing to the zoom only while it is below the floor keeps re-renders
  // rare: in the common case the subscription yields a constant null.
  const zoomBelowBoundsMinZoom = useStore((state) =>
    state.transform[2] < boundsMinZoom ? state.transform[2] : null,
  );

  // Debounced so the floor holds still during a continuous zoom gesture or
  // node drag, and only commits once the viewport settles — without this, a
  // zoom-in while below the floor would pin the floor on every tick and make
  // it impossible to reverse mid-gesture.
  const minZoom = useDebouncedValue(
    Math.min(boundsMinZoom, zoomBelowBoundsMinZoom ?? boundsMinZoom),
    MIN_ZOOM_DEBOUNCE_MS,
  );

  const isReadonly = useIsReadOnly();

  function isValidConnection(connection: Connection) {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);

    if (!sourceNode || !targetNode) {
      return false;
    }

    if (sourceNode.type === "place" && targetNode.type === "transition") {
      return true;
    }
    if (sourceNode.type === "transition" && targetNode.type === "place") {
      return true;
    }
    if (
      sourceNode.type === "transition" &&
      targetNode.type === "componentInstance"
    ) {
      return connection.targetHandle?.startsWith("port-in-") ?? false;
    }
    if (
      sourceNode.type === "componentInstance" &&
      targetNode.type === "transition"
    ) {
      return connection.sourceHandle?.startsWith("port-out-") ?? false;
    }

    return false;
  }

  function onConnect(connection: Connection) {
    if (!isValidConnection(connection)) {
      return;
    }

    const source = connection.source;
    const target = connection.target;

    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);

    if (!sourceNode || !targetNode) {
      return;
    }

    // Determine direction: place->transition or transition->place
    if (sourceNode.type === "place" && targetNode.type === "transition") {
      addArc({
        transitionId: target,
        arcDirection: "input",
        placeId: source,
        weight: 1,
      });
    } else if (
      sourceNode.type === "transition" &&
      targetNode.type === "place"
    ) {
      addArc({
        transitionId: source,
        arcDirection: "output",
        placeId: target,
        weight: 1,
      });
    } else if (
      sourceNode.type === "transition" &&
      targetNode.type === "componentInstance" &&
      connection.targetHandle?.startsWith("port-in-")
    ) {
      addArc({
        transitionId: source,
        arcDirection: "output",
        endpoint: {
          kind: "componentPort",
          componentInstanceId: target,
          portPlaceId: connection.targetHandle.slice("port-in-".length),
        },
        weight: 1,
      });
    } else if (
      sourceNode.type === "componentInstance" &&
      targetNode.type === "transition" &&
      connection.sourceHandle?.startsWith("port-out-")
    ) {
      addArc({
        transitionId: target,
        arcDirection: "input",
        endpoint: {
          kind: "componentPort",
          componentInstanceId: source,
          portPlaceId: connection.sourceHandle.slice("port-out-".length),
        },
        weight: 1,
      });
    }
  }

  // Shared function to create a node at a given position
  function createNodeAtPosition(
    nodeType: "place" | "transition",
    rawPosition: { x: number; y: number },
  ) {
    if (isReadonly) {
      return;
    }
    const id = `${nodeType}__${generateUuid()}`;
    const itemNumber = nodes.length + 1;
    const position = snapToGrid ? snapPositionToGrid(rawPosition) : rawPosition;

    if (nodeType === "place") {
      addPlace({
        id,
        name: `Place${itemNumber}`,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: position.x,
        y: position.y,
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
      });
    }
    selectItem({ type: nodeType, id });
    setEditionMode("cursor");
  }

  // Node click selection is handled by ReactFlow's internal handleNodeClick
  // which fires select changes through onNodesChange → useApplyNodeChanges.
  // We don't need an onNodeClick handler for selection — doing so would
  // conflict with ReactFlow's internal selection management.

  // Edge selection is handled here instead of in applyNodeChanges,
  // because we want edges selectable only by click, not by drag-to-select.
  function onEdgeClick(_event: React.MouseEvent, edge: { id: string }) {
    selectItem({
      type: "arc",
      id: edge.id,
    });
  }

  function onNodeMouseEnter(
    _event: React.MouseEvent,
    node: { id: string; type?: string },
  ) {
    const type = node.type as
      | "place"
      | "transition"
      | "componentInstance"
      | undefined;
    if (type) setHoveredItem({ type, id: node.id });
  }

  function onNodeMouseLeave() {
    clearHoveredItem();
  }

  function onEdgeMouseEnter(_event: React.MouseEvent, edge: { id: string }) {
    setHoveredItem({
      type: "arc",
      id: edge.id,
    });
  }

  function onEdgeMouseLeave() {
    clearHoveredItem();
  }

  function onPaneClick(event: React.MouseEvent) {
    // Clear selection when clicking empty canvas in select mode
    if (editionMode === "cursor") {
      clearSelection();
      return;
    }

    if (editionMode === "add-component" && componentSubnetId) {
      const subnet = (petriNetDefinition.subnets ?? []).find(
        ({ id }) => id === componentSubnetId,
      );
      const rawPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const position = snapToGrid
        ? snapPositionToGrid(rawPosition)
        : rawPosition;
      const id = `componentInstance__${generateUuid()}`;

      addComponentInstance({
        id,
        name: subnet ? toInstanceName(subnet.name) : "Instance",
        subnetId: componentSubnetId,
        parameterValues: {},
        x: position.x,
        y: position.y,
      });
      selectItem({ type: "componentInstance", id });
      setEditionMode("cursor");
      return;
    }

    if (editionMode !== "add-place" && editionMode !== "add-transition") {
      return;
    }

    const nodeType = editionMode === "add-place" ? "place" : "transition";

    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
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

    const nodeType = event.dataTransfer.getData("application/reactflow");

    // Validate that we have a valid node type
    if (nodeType !== "place" && nodeType !== "transition") {
      return;
    }

    const position = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
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
    editionMode === "add-place" ||
    editionMode === "add-transition" ||
    editionMode === "add-component";
  const isPanMode = editionMode === "cursor" && cursorMode === "pan";
  const isSelectMode = editionMode === "cursor" && cursorMode === "select";

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={REACTFLOW_EDGE_TYPES}
      onNodesChange={applyNodeChanges}
      onEdgesChange={applyNodeChanges}
      onConnect={isReadonly ? undefined : onConnect}
      onEdgeClick={onEdgeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
      onPaneClick={onPaneClick}
      onDrop={isReadonly ? undefined : onDrop}
      onDragOver={isReadonly ? undefined : onDragOver}
      defaultViewport={initialViewport}
      proOptions={{ hideAttribution: true }}
      panOnDrag={isPanMode ? true : isAddMode ? false : [1, 2]}
      selectionOnDrag={isSelectMode}
      nodesDraggable={!isReadonly}
      nodesConnectable={!isReadonly}
      elementsSelectable={!isAddMode}
      selectionMode={
        partialSelection ? SelectionMode.Partial : SelectionMode.Full
      }
      selectNodesOnDrag={false}
      nodeOrigin={[0.5, 0.5]}
      deleteKeyCode={null}
      panOnScroll={false}
      zoomOnScroll
      minZoom={minZoom}
    >
      <Background gap={SNAP_GRID_SIZE} size={1} />
      {hasCanvasSelection && <div className={fadeBgStyle} />}
      {showMinimap && <MiniMap pannable zoomable />}
      {!isActualMode && <ViewportControls viewportActions={viewportActions} />}
    </ReactFlow>
  );
};
