/**
 * @layerRoot ui.views.canvas.react-flow
 * @role Draws the canvas scene with React Flow and adapts its gestures to the shared canvas interactions
 */

import "@xyflow/react/dist/style.css";
import {
  Background,
  ConnectionMode,
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
import { useCanvasInsets } from "../../../../hooks/use-canvas-insets";
import { readDraggedNodeKind } from "../../../shared/canvas-node-drag";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import {
  CanvasControllerContext,
  type CanvasRenderer,
} from "../../canvas-renderer";
import { getInitialViewport } from "../../canvas-viewport";
import { ViewportControls } from "../../components/viewport-controls";
import { useKeepSelectionInView } from "../../hooks/use-keep-selection-in-view";
import { useDebouncedValue } from "../../hooks/util/use-debounced-value";
import { useCanvasInteractions } from "../../use-canvas-interactions";
import { Arc } from "./react-flow-canvas/arc";
import { ClassicPlaceNode } from "./react-flow-canvas/classic-place-node";
import { ClassicTransitionNode } from "./react-flow-canvas/classic-transition-node";
import { ComponentInstanceNode } from "./react-flow-canvas/component-instance-node";
import { FusionEdge } from "./react-flow-canvas/fusion-edge";
import { MiniMap } from "./react-flow-canvas/mini-map";
import { OutlineConnectionLine } from "./react-flow-canvas/outline-connection-line";
import { PlaceNode } from "./react-flow-canvas/place-node";
import { toCanvasConnection } from "./react-flow-canvas/port-handles";
import { linkItemOf } from "./react-flow-canvas/react-flow-types";
import {
  isMac,
  selectionKeyCode,
  useMultiSelectionModifier,
} from "./react-flow-canvas/selection-keys";
import { TransitionNode } from "./react-flow-canvas/transition-node";
import { useApplyNodeChanges } from "./react-flow-canvas/use-apply-node-changes";
import { useEscapeCancelsConnection } from "./react-flow-canvas/use-escape-cancels-connection";
import { useLinkRewiring } from "./react-flow-canvas/use-link-rewiring";
import { useMonacoKeyboardIsolation } from "./react-flow-canvas/use-monaco-keyboard-isolation";
import { useReactFlowController } from "./react-flow-canvas/use-react-flow-controller";
import { useReactFlowElements } from "./react-flow-canvas/use-react-flow-elements";
import { useReadOnlyNodeDrag } from "./react-flow-canvas/use-read-only-node-drag";

import type { CanvasNodeKind } from "../../canvas-scene";
import type { Connection } from "@xyflow/react";

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
  fusion: FusionEdge,
};

const MIN_ZOOM_DEBOUNCE_MS = 100;

const paneStyle = css({
  width: "[100%]",
  height: "[100%]",
  "&[data-animated=false]": {
    "--canvas-focus-duration": "0ms",
    "--canvas-fold-duration": "0ms",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "--canvas-fold-duration": "0ms",
  },
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
  "& .react-flow__node, & .arc-strokes, & .minimap-shape": {
    transition: "[opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // A component instance's height animates between folded and unfolded, so
  // the card grows and shrinks rather than jumping. React Flow reads the pins
  // again on every frame the node resizes, which keeps the links on them.
  "& .react-flow__node.react-flow__node-componentInstance": {
    transition:
      "[opacity var(--canvas-focus-duration, 200ms) ease, height var(--canvas-fold-duration, 180ms) cubic-bezier(0.22, 1, 0.36, 1)]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
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
  registerController,
}) => {
  const presentation = usePetrinautPresentation();
  const { compactNodes, showMinimap, showAnimations, partialSelection } =
    use(UserSettingsContext);
  const { globalMode } = use(EditorContext);
  const { savedViewport, rememberViewport } = use(CanvasViewportContext);
  const isActualMode = globalMode === "actual";
  const nodeTypes = compactNodes ? COMPACT_NODE_TYPES : CLASSIC_NODE_TYPES;

  const interactions = useCanvasInteractions(scene);
  const flowStore = useStoreApi();
  const readOnlyDragHandlers = useReadOnlyNodeDrag({
    readonly: interactions.readonly,
    isPanMode: interactions.isPanMode,
  });
  const { nodes, edges } = useReactFlowElements(scene);
  const applyChanges = useApplyNodeChanges(interactions);
  const insets = useCanvasInsets();

  const { isValidConnection, reconnectProps } = useLinkRewiring(
    interactions,
    () => flowStore.getState().connection.inProgress,
  );

  const connect = (connection: Connection) => {
    const { connection: gesture, connectionClickStartHandle } =
      flowStore.getState();
    if (gesture.inProgress || connectionClickStartHandle) {
      interactions.connect(toCanvasConnection(connection));
    }
  };

  const bounds = getBoundsOfCenteredBoxes(scene.nodes);
  const { controller, camera } = useReactFlowController({
    bounds,
    containerSize,
    insets,
    animated: showAnimations,
  });

  useEffect(() => {
    registerController(controller);
    return () => registerController(null);
  }, [controller, registerController]);

  useEscapeCancelsConnection();
  useMonacoKeyboardIsolation();
  useMultiSelectionModifier(isMac);

  // The viewport at mount: where this net was last left, or centered on the
  // net. Bounds and container changes must not recompute it. The saved
  // viewport also restores the camera when the canvas resumes from Activity.
  const [initialViewport] = useState(
    () => savedViewport ?? getInitialViewport(bounds, containerSize, insets),
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

  useKeepSelectionInView({
    controller,
    scene,
    containerSize,
    insets,
    minZoom,
  });

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
        {...readOnlyDragHandlers}
        className={paneStyle}
        data-animated={showAnimations}
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
          // A port can be joined from either of its pins to either pin of
          // another, so a connection may run between two handles of one kind.
          connectionMode={ConnectionMode.Loose}
          connectionLineComponent={OutlineConnectionLine}
          isValidConnection={isValidConnection}
          onConnect={interactions.readonly ? undefined : connect}
          // Only a fusion link offers its ends to drag: each says so itself.
          edgesReconnectable={false}
          {...reconnectProps}
          onEdgeClick={(_event, edge) =>
            interactions.selectLink(linkItemOf(edge))
          }
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
          onNodeDragStart={(_event, node) =>
            interactions.hoverNode({
              id: node.id,
              kind: node.type as CanvasNodeKind,
            })
          }
          onEdgeMouseEnter={(_event, edge) =>
            interactions.hoverLink(linkItemOf(edge))
          }
          onEdgeMouseLeave={interactions.clearHover}
          onSelectionStart={interactions.beginSelectionGesture}
          onSelectionEnd={interactions.endSelectionGesture}
          onPaneClick={(event) =>
            interactions.clickPane(scenePositionOf(event))
          }
          // A gesture takes the camera back from any move under way. Frames
          // of the camera's own moves are not remembered, only where it stops.
          onMoveStart={(event) => {
            if (event) {
              camera.cancel();
            }
          }}
          onMoveEnd={(_event, viewport) => {
            if (!camera.isAnimating()) {
              rememberViewport(viewport);
            }
          }}
          onDrop={interactions.readonly ? undefined : onDrop}
          onDragOver={interactions.readonly ? undefined : onDragOver}
          defaultViewport={savedViewport ?? initialViewport}
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
          selectionKeyCode={selectionKeyCode}
          multiSelectionKeyCode={null}
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
          {!isActualMode && <ViewportControls />}
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
