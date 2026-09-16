/**
 * @layerRoot ui.views.canvas.react-flow
 * @role Draws the canvas scene with React Flow and adapts its gestures to the shared canvas interactions
 */

import "@xyflow/react/dist/style.css";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useStore,
  useStoreApi,
} from "@xyflow/react";
import { use, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
} from "@hashintel/petrinaut-core";

import { CanvasViewportContext } from "../../../../../react/state/canvas-viewport-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { SNAP_GRID_SIZE } from "../../../../constants/ui";
import { readDraggedNodeKind } from "../../../shared/canvas-node-drag";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import {
  CanvasControllerContext,
  type CanvasRenderer,
} from "../../canvas-renderer";
import { getInitialViewport } from "../../canvas-viewport";
import { ViewportControls } from "../../components/viewport-controls";
import { useRecenterOnPanelOpen } from "../../hooks/use-recenter-on-panel-open";
import { useDebouncedValue } from "../../hooks/util/use-debounced-value";
import { useCanvasInteractions } from "../../use-canvas-interactions";
import { Arc } from "./react-flow-canvas/arc";
import { ClassicPlaceNode } from "./react-flow-canvas/classic-place-node";
import { ClassicTransitionNode } from "./react-flow-canvas/classic-transition-node";
import { ComponentInstanceNode } from "./react-flow-canvas/component-instance-node";
import { MiniMap } from "./react-flow-canvas/mini-map";
import { OutlineConnectionLine } from "./react-flow-canvas/outline-connection-line";
import { PlaceNode } from "./react-flow-canvas/place-node";
import { toCanvasConnection } from "./react-flow-canvas/port-handles";
import { TransitionNode } from "./react-flow-canvas/transition-node";
import { useApplyNodeChanges } from "./react-flow-canvas/use-apply-node-changes";
import { useMonacoKeyboardIsolation } from "./react-flow-canvas/use-monaco-keyboard-isolation";
import { useReactFlowController } from "./react-flow-canvas/use-react-flow-controller";
import { useReactFlowElements } from "./react-flow-canvas/use-react-flow-elements";

import type { CanvasNodeKind } from "../../canvas-scene";
import type { Connection, IsValidConnection } from "@xyflow/react";

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

const paneStyle = css({
  width: "[100%]",
  height: "[100%]",
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
  // A node outside the neighbourhood recedes from here, whole: card, label,
  // token count and handles together, so nothing of it stays at full strength
  // while the neighbourhood carries the colour. A node React Flow has marked
  // selected is kept out of the fade as well: a drag-selection marks nodes
  // before the change reaches the editor's selection, and until it does they
  // wear the focus ring, so they must not be faded under it.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected)":
    {
      opacity: "[0.4]",
    },
  // An arc outside the neighbourhood recedes from here, so a hover leaves
  // every arc it did not touch alone. Only the strokes fade: an arc's weight
  // is worth reading whether or not the arc carrying it is in focus.
  "&[data-focus-active] .react-flow__edge:not(.canvas-focus-role) .arc-strokes":
    {
      opacity: "[0.45]",
    },
  // A minimap shape outside the neighbourhood drops right back: the map is
  // small enough that anything short of that competes with the neighbourhood.
  "&[data-focus-active] .minimap-shape:not(.canvas-focus-role)": {
    opacity: "[0.12]",
  },
});

const ReactFlowCanvasInner: CanvasRenderer = ({
  scene,
  containerSize,
  viewportActions,
}) => {
  const presentation = usePetrinautPresentation();
  const {
    compactNodes,
    showMinimap,
    partialSelection,
    enableAutomaticArcConnections,
  } = use(UserSettingsContext);
  const { globalMode } = use(EditorContext);
  const { savedViewport, rememberViewport } = use(CanvasViewportContext);
  const isActualMode = globalMode === "actual";
  const nodeTypes = compactNodes ? COMPACT_NODE_TYPES : CLASSIC_NODE_TYPES;

  const interactions = useCanvasInteractions(scene);
  const flowStore = useStoreApi();
  const controller = useReactFlowController();
  const { nodes, edges } = useReactFlowElements(scene);
  const applyChanges = useApplyNodeChanges(interactions);

  useRecenterOnPanelOpen(controller, containerSize, scene.nodes);
  useMonacoKeyboardIsolation();

  useEffect(() => {
    const cancel = () => {
      flowStore.getState().cancelConnection();
      flowStore.setState({ connectionClickStartHandle: null });
    };
    cancel();
    if (!enableAutomaticArcConnections) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const { connection, connectionClickStartHandle } = flowStore.getState();
      if (
        event.key === "Escape" &&
        (connection.inProgress || connectionClickStartHandle)
      ) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enableAutomaticArcConnections, flowStore]);

  const isValidOutlineConnection: IsValidConnection = (connection) => {
    const canvasConnection = toCanvasConnection(connection);
    return (
      !canvasConnection.sourcePortId &&
      !canvasConnection.targetPortId &&
      interactions.isValidConnection(canvasConnection)
    );
  };

  const connect = (connection: Connection) => {
    const { connection: gesture, connectionClickStartHandle } =
      flowStore.getState();
    if (
      (!gesture.inProgress && !connectionClickStartHandle) ||
      (enableAutomaticArcConnections && !isValidOutlineConnection(connection))
    ) {
      return;
    }
    interactions.connect(toCanvasConnection(connection));
  };

  const bounds = getBoundsOfCenteredBoxes(scene.nodes);

  // The viewport at mount: where this net was last left, or centered on the
  // net. ReactFlow owns the viewport from then on, so later bounds or
  // container changes must not recompute it.
  const [initialViewport] = useState(
    () => savedViewport ?? getInitialViewport(bounds, containerSize),
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

  const scenePositionOf = (event: { clientX: number; clientY: number }) =>
    controller.screenToScene({ x: event.clientX, y: event.clientY });

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const kind = readDraggedNodeKind(event.dataTransfer);
    if (kind) {
      interactions.dropNode(kind, scenePositionOf(event));
    }
  };

  return (
    <CanvasControllerContext value={controller}>
      <div
        className={paneStyle}
        data-focus-active={scene.focusActive ? "" : undefined}
        style={{
          // @ts-expect-error CSS variables work at runtime, but are not in the type system
          "--pane-cursor": interactions.paneCursor,
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={REACTFLOW_EDGE_TYPES}
          onNodesChange={applyChanges}
          onEdgesChange={applyChanges}
          connectionLineComponent={
            enableAutomaticArcConnections ? OutlineConnectionLine : undefined
          }
          isValidConnection={
            enableAutomaticArcConnections ? isValidOutlineConnection : undefined
          }
          onConnect={interactions.readonly ? undefined : connect}
          onEdgeClick={(_event, edge) => interactions.selectArc(edge.id)}
          // Node click selection is handled by ReactFlow's internal
          // handleNodeClick, which fires select changes through
          // onNodesChange; an onNodeClick handler would conflict with it.
          onNodeMouseEnter={(_event, node) =>
            interactions.hoverNode({
              id: node.id,
              kind: node.type as CanvasNodeKind,
            })
          }
          onNodeMouseLeave={interactions.clearHover}
          onEdgeMouseEnter={(_event, edge) => interactions.hoverArc(edge.id)}
          onEdgeMouseLeave={interactions.clearHover}
          onSelectionStart={interactions.beginSelectionGesture}
          onSelectionEnd={interactions.endSelectionGesture}
          onPaneClick={(event) =>
            interactions.clickPane(scenePositionOf(event))
          }
          onMoveEnd={(_event, viewport) => rememberViewport(viewport)}
          onDrop={interactions.readonly ? undefined : onDrop}
          onDragOver={interactions.readonly ? undefined : onDragOver}
          defaultViewport={initialViewport}
          proOptions={{ hideAttribution: true }}
          panOnDrag={
            interactions.isPanMode
              ? true
              : interactions.isAddMode
                ? false
                : [1, 2]
          }
          selectionOnDrag={interactions.isSelectMode}
          nodesDraggable={!interactions.readonly}
          nodesConnectable={!interactions.readonly}
          elementsSelectable={!interactions.isAddMode}
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
          {showMinimap && presentation.showMinimap && (
            <MiniMap pannable zoomable />
          )}
          {!isActualMode && (
            <ViewportControls viewportActions={viewportActions} />
          )}
        </ReactFlow>
      </div>
    </CanvasControllerContext>
  );
};

/**
 * The React Flow implementation of the canvas. React Flow owns the viewport
 * from the initial fit onwards; node and edge state is derived from the scene
 * on every render, and every change React Flow reports goes back through the
 * shared canvas interactions.
 */
export const ReactFlowCanvas: CanvasRenderer = (props) => (
  <ReactFlowProvider>
    <ReactFlowCanvasInner {...props} />
  </ReactFlowProvider>
);
