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
} from "@xyflow/react";
import { use, useState } from "react";

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
import { PlaceNode } from "./react-flow-canvas/place-node";
import { toCanvasConnection } from "./react-flow-canvas/port-handles";
import { TransitionNode } from "./react-flow-canvas/transition-node";
import { useApplyNodeChanges } from "./react-flow-canvas/use-apply-node-changes";
import { useMonacoKeyboardIsolation } from "./react-flow-canvas/use-monaco-keyboard-isolation";
import { useReactFlowController } from "./react-flow-canvas/use-react-flow-controller";
import { useReactFlowElements } from "./react-flow-canvas/use-react-flow-elements";

import type { CanvasNodeKind } from "../../canvas-scene";

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
});

const fadeBgStyle = css({
  position: "absolute",
  inset: "[0]",
  background: "[rgba(255, 255, 255, 0.3)]",
  pointerEvents: "none",
});

const ReactFlowCanvasInner: CanvasRenderer = ({
  scene,
  containerSize,
  viewportActions,
}) => {
  const { compactNodes, showMinimap, partialSelection } =
    use(UserSettingsContext);
  const { hasCanvasSelection, globalMode } = use(EditorContext);
  const { savedViewport, rememberViewport } = use(CanvasViewportContext);
  const isActualMode = globalMode === "actual";
  const nodeTypes = compactNodes ? COMPACT_NODE_TYPES : CLASSIC_NODE_TYPES;

  const interactions = useCanvasInteractions(scene);
  const controller = useReactFlowController();
  const { nodes, edges } = useReactFlowElements(scene);
  const applyChanges = useApplyNodeChanges(interactions);

  useRecenterOnPanelOpen(controller, containerSize, scene.nodes);
  useMonacoKeyboardIsolation();

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
          onConnect={
            interactions.readonly
              ? undefined
              : (connection) =>
                  interactions.connect(toCanvasConnection(connection))
          }
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
          {hasCanvasSelection && <div className={fadeBgStyle} />}
          {showMinimap && <MiniMap pannable zoomable />}
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
