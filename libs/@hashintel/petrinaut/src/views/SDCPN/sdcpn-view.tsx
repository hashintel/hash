import "@xyflow/react/dist/style.css";

import { css } from "@hashintel/ds-helpers/css";
import { useResizeObserver } from "./hooks/util/use-resize-observer";
import { useDebounceCallback } from "./hooks/util/use-debounce-callback";
import type { Connection } from "@xyflow/react";
import { Background, ReactFlow, SelectionMode } from "@xyflow/react";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import { SNAP_GRID_SIZE } from "../../constants/ui";
import { snapPositionToGrid } from "../../lib/snap-position-to-grid";
import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
} from "../../core/default-codes";
import { EditorContext } from "../../state/editor-context";
import { MutationContext } from "../../state/mutation-context";
import { SDCPNContext } from "../../state/sdcpn-context";
import { useIsReadOnly } from "../../state/use-is-read-only";
import { UserSettingsContext } from "../../state/user-settings-context";
import type { ViewportAction } from "../../types/viewport-action";
import { Arc } from "./components/arc";
import { ClassicPlaceNode } from "./components/classic-place-node";
import { ClassicTransitionNode } from "./components/classic-transition-node";
import { MiniMap } from "./components/mini-map";
import { PlaceNode } from "./components/place-node";
import { TransitionNode } from "./components/transition-node";
import { ViewportControls } from "./components/viewport-controls";
import { useApplyNodeChanges } from "./hooks/use-apply-node-changes";
import { useRecenterOnPanelOpen } from "./hooks/use-recenter-on-panel-open";
import { useSdcpnToReactFlow } from "./hooks/use-sdcpn-to-react-flow";
import type { PetrinautReactFlowInstance } from "./reactflow-types";

const COMPACT_NODE_TYPES = {
  place: PlaceNode,
  transition: TransitionNode,
};

const CLASSIC_NODE_TYPES = {
  place: ClassicPlaceNode,
  transition: ClassicTransitionNode,
};

const REACTFLOW_EDGE_TYPES = {
  default: Arc,
};

const ZOOM_PADDING = 0.4;

const canvasContainerStyle = css({
  width: "[100%]",
  height: "[100%]",
  position: "relative",
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
});

const fadeBgStyle = css({
  position: "absolute",
  inset: "[0]",
  background: "[rgba(255, 255, 255, 0.3)]",
  pointerEvents: "none",
});

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from SDCPNContext and EditorContext, and handles all ReactFlow interactions.
 */
export const SDCPNView: React.FC<{
  viewportActions?: ViewportAction[];
}> = ({ viewportActions }) => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<PetrinautReactFlowInstance | null>(null);

  const { compactNodes, showMinimap, snapToGrid, partialSelection } =
    use(UserSettingsContext);
  const nodeTypes = useMemo(
    () => (compactNodes ? COMPACT_NODE_TYPES : CLASSIC_NODE_TYPES),
    [compactNodes],
  );
  // min-zoom 0 allows a user to zoom out infinitely. We later constrain this to be slightly larger than the nodes present
  // in the net, but default to 0 until we can measure the viewport height
  const [minZoom, setMinZoom] = useState(0);

  // SDCPN store
  const { petriNetId } = use(SDCPNContext);
  const { addPlace, addTransition, addArc } = use(MutationContext);

  const {
    editionMode,
    setEditionMode,
    cursorMode,
    selectItem,
    clearSelection,
    hasCanvasSelection,
    setHoveredItem,
    clearHoveredItem,
  } = use(EditorContext);

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format with dragging state
  const { nodes, arcs } = useSdcpnToReactFlow();

  // When a panel opens, recenter the viewport to keep selected nodes visible
  useRecenterOnPanelOpen(canvasContainer, reactFlowInstance, nodes);

  // Center viewport on SDCPN load
  useEffect(() => {
    void reactFlowInstance?.fitView({
      padding: ZOOM_PADDING,
      minZoom: minZoom,
      maxZoom: 1.1,
    });
  }, [reactFlowInstance, petriNetId]);

  // This sets the min zoom (ie the max you can zoom out to) to be slightly larger than the total size of the current net.
  // We also avoid shrinking the zoom to be lower than the current zoom level to avoid changing the zoom without user input
  const fitZoomToNodes = useDebounceCallback(
    (
      instance: PetrinautReactFlowInstance | null,
      canvasEl: React.RefObject<HTMLDivElement | null>,
    ) => {
      const nodesSize = instance?.getNodesBounds(instance.getNodes());
      const viewportSize = canvasEl.current?.getBoundingClientRect();

      if (viewportSize && nodesSize) {
        // Specifically check that the height and width are not 0. If the net is empty/size 0, use a default minZoom of 0.5
        // otherwise, set the minZoom to the size of the net with some extra padding
        const newZoom =
          nodesSize.height && nodesSize.width
            ? Math.min(
                viewportSize.height / nodesSize.height,
                viewportSize.width / nodesSize.width,
              ) * ZOOM_PADDING
            : 0.5;

        // Don't reduce the zoom level below the users current zoom
        const currentZoom = instance?.getViewport().zoom;
        const safeZoom = currentZoom ? Math.min(currentZoom, newZoom) : newZoom;

        // even if theres only a single place, always allow the user to zoom out at least a minimum reasonable amount
        setMinZoom(Math.min(safeZoom, 0.75));
      }
    },
    100,
  );

  useResizeObserver(canvasContainer, () => {
    fitZoomToNodes(reactFlowInstance, canvasContainer);
  });

  const isReadonly = useIsReadOnly();

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

    const source = connection.source;
    const target = connection.target;

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

  function onInit(instance: PetrinautReactFlowInstance) {
    setReactFlowInstance(instance);
    fitZoomToNodes(instance, canvasContainer);
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

  // Edge (arc) selection is handled here instead of in applyNodeChanges,
  // because we want arcs selectable only by click, not by drag-to-select.
  function onEdgeClick(_event: React.MouseEvent, edge: { id: string }) {
    selectItem({ type: "arc", id: edge.id });
  }

  function onNodeMouseEnter(
    _event: React.MouseEvent,
    node: { id: string; type?: string },
  ) {
    const type = node.type as "place" | "transition" | undefined;
    if (type) setHoveredItem({ type, id: node.id });
  }

  function onNodeMouseLeave() {
    clearHoveredItem();
  }

  function onEdgeMouseEnter(_event: React.MouseEvent, edge: { id: string }) {
    setHoveredItem({ type: "arc", id: edge.id });
  }

  function onEdgeMouseLeave() {
    clearHoveredItem();
  }

  function onPaneClick(event: React.MouseEvent) {
    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    // Clear selection when clicking empty canvas in select mode
    if (editionMode === "cursor") {
      clearSelection();
      return;
    }

    // Only create nodes in add modes
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (editionMode !== "add-place" && editionMode !== "add-transition") {
      return;
    }

    const nodeType = editionMode === "add-place" ? "place" : "transition";

    const position = reactFlowInstance.screenToFlowPosition({
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

    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    const nodeType = event.dataTransfer.getData("application/reactflow");

    // Validate that we have a valid node type
    if (nodeType !== "place" && nodeType !== "transition") {
      return;
    }

    const position = reactFlowInstance.screenToFlowPosition({
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
    editionMode === "add-place" || editionMode === "add-transition";
  const isPanMode = editionMode === "cursor" && cursorMode === "pan";
  const isSelectMode = editionMode === "cursor" && cursorMode === "select";

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
      className={canvasContainerStyle}
      style={{
        // @ts-expect-error CSS variables work at runtime, but are not in the type system
        "--pane-cursor": getCursorStyle() as string,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={arcs}
        nodeTypes={nodeTypes}
        edgeTypes={REACTFLOW_EDGE_TYPES}
        onNodesChange={(n) => {
          applyNodeChanges(n);
          fitZoomToNodes(reactFlowInstance, canvasContainer);
        }}
        onEdgesChange={applyNodeChanges}
        onConnect={isReadonly ? undefined : onConnect}
        onInit={onInit}
        onEdgeClick={onEdgeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onPaneClick={onPaneClick}
        onDrop={isReadonly ? undefined : onDrop}
        onDragOver={isReadonly ? undefined : onDragOver}
        onViewportChange={() => {
          fitZoomToNodes(reactFlowInstance, canvasContainer);
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
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
        <ViewportControls viewportActions={viewportActions} />
      </ReactFlow>
    </div>
  );
};
