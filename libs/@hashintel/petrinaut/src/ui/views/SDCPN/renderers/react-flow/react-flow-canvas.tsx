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

import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
} from "@hashintel/petrinaut-core";

import { CanvasViewportContext } from "../../../../../react/state/canvas-viewport-context";
import { useEditorState } from "../../../../../react/state/editor-context";
import { useUserSettings } from "../../../../../react/state/user-settings-context";
import { SNAP_GRID_SIZE } from "../../../../constants/ui";
import { useCanvasInsetsReader } from "../../../../hooks/use-canvas-insets";
import {
  readDraggedComponent,
  readDraggedNodeKind,
} from "../../../shared/canvas-node-drag";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import {
  CanvasControllerContext,
  type CanvasRenderer,
} from "../../canvas-renderer";
import { fitSceneViewport } from "../../canvas-viewport";
import { ViewportControls } from "../../components/viewport-controls";
import { useKeepSelectionInView } from "../../hooks/use-keep-selection-in-view";
import { useDebouncedValue } from "../../hooks/util/use-debounced-value";
import { focusFadeMs } from "../../styles/focus";
import { useCanvasInteractions } from "../../use-canvas-interactions";
import { ArcLayer } from "./react-flow-canvas/arc-layer";
import { ArcLayerContext } from "./react-flow-canvas/arc-layer-context";
import {
  ArcPulsesContext,
  createArcPulses,
} from "./react-flow-canvas/arc-pulses";
import { FusionEdge } from "./react-flow-canvas/fusion-edge";
import { LinkRewiringContext } from "./react-flow-canvas/link-rewiring-context";
import { MiniMap } from "./react-flow-canvas/mini-map";
import {
  classicNodeTypes,
  compactNodeTypes,
} from "./react-flow-canvas/node-types";
import { OutlineConnectionLine } from "./react-flow-canvas/outline-connection-line";
import { paneStyle } from "./react-flow-canvas/pane-style";
import { toCanvasConnection } from "./react-flow-canvas/port-handles";
import { fusionItemOf } from "./react-flow-canvas/react-flow-types";
import {
  isMac,
  selectionKeyCode,
  useSelectionKeys,
} from "./react-flow-canvas/selection-keys";
import { useApplyNodeChanges } from "./react-flow-canvas/use-apply-node-changes";
import { useEscapeCancelsConnection } from "./react-flow-canvas/use-escape-cancels-connection";
import { useLinkRewiring } from "./react-flow-canvas/use-link-rewiring";
import { useMonacoKeyboardIsolation } from "./react-flow-canvas/use-monaco-keyboard-isolation";
import { useReactFlowController } from "./react-flow-canvas/use-react-flow-controller";
import { useReactFlowElements } from "./react-flow-canvas/use-react-flow-elements";
import { useReadOnlyNodeDrag } from "./react-flow-canvas/use-read-only-node-drag";

import type { Connection } from "@xyflow/react";

const REACTFLOW_EDGE_TYPES = {
  arcs: ArcLayer,
  fusion: FusionEdge,
};

const MIN_ZOOM_DEBOUNCE_MS = 100;

const ReactFlowCanvasInner: CanvasRenderer = ({
  scene,
  containerSize,
  registerController,
}) => {
  const presentation = usePetrinautPresentation();
  // Each by selector: a panel that opens or a selection changes both
  // contexts, and every node and arc of the net renders with this component.
  const compactNodes = useUserSettings((settings) => settings.compactNodes);
  const showMinimap = useUserSettings((settings) => settings.showMinimap);
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const partialSelection = useUserSettings(
    (settings) => settings.partialSelection,
  );
  const globalMode = useEditorState((editor) => editor.globalMode);
  const { savedViewport, rememberViewport } = use(CanvasViewportContext);
  const isActualMode = globalMode === "actual";
  const nodeTypes = compactNodes ? compactNodeTypes : classicNodeTypes;

  // Each action apart: a closure over `interactions` would be new whenever a
  // mode changes, and React Flow renders every node and arc for a new handler.
  const interactions = useCanvasInteractions();
  const {
    readonly,
    isAddMode,
    isPanMode,
    connect,
    selectLink,
    hover,
    enter,
    clearHover,
    clickPane,
    dropNode,
    dropComponent,
  } = interactions;
  const flowStore = useStoreApi();
  const readOnlyDragHandlers = useReadOnlyNodeDrag({ readonly, isPanMode });
  const { nodes, edges, focusDrawn } = useReactFlowElements(scene);
  const [arcPulses] = useState(createArcPulses);
  const applyChanges = useApplyNodeChanges(interactions);
  const insets = useCanvasInsetsReader();

  const { isValidConnection, reconnectProps, isRewiring } = useLinkRewiring(
    interactions,
    () => flowStore.getState().connection.inProgress,
  );

  const onConnect = (connection: Connection) => {
    const { connection: gesture, connectionClickStartHandle } =
      flowStore.getState();
    if (gesture.inProgress || connectionClickStartHandle) {
      connect(toCanvasConnection(connection));
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
  useSelectionKeys(isMac);

  // The viewport at mount: where this net was last left, or centered on the
  // net, or the origin for an empty one. Bounds and container changes must
  // not recompute it. The saved viewport also restores the camera when the
  // canvas resumes from Activity.
  const [initialViewport] = useState(
    () =>
      savedViewport ??
      fitSceneViewport(bounds, containerSize, insets()) ?? {
        x: 0,
        y: 0,
        zoom: 1,
      },
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

  // A move of the camera carries items under a pointer at rest, as a pan
  // carries them under a pressed one, so what comes under it meanwhile waits
  // the same way: for the camera to stop.
  const enterItem = (event: React.MouseEvent, id: string) =>
    enter(id, {
      pressed: event.buttons !== 0 || camera.isAnimating(),
      connecting: flowStore.getState().connection.inProgress,
    });

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const kind = readDraggedNodeKind(event.dataTransfer);
    const component = readDraggedComponent(event.dataTransfer);
    if (kind) {
      dropNode(kind, scenePositionOf(event));
    } else if (component) {
      dropComponent(component, scenePositionOf(event));
    }
  };

  return (
    <CanvasControllerContext value={controller}>
      <div
        {...readOnlyDragHandlers}
        onPointerUp={interactions.releasePointer}
        className={paneStyle}
        data-animated={showAnimations}
        data-focus-active={focusDrawn ? "" : undefined}
        style={{
          // @ts-expect-error CSS variables work at runtime, but are not in the type system
          "--pane-cursor": interactions.paneCursor,
          "--canvas-focus-duration": `${showAnimations ? focusFadeMs : 0}ms`,
        }}
      >
        <LinkRewiringContext value={isRewiring}>
          <ArcPulsesContext value={arcPulses}>
            <ArcLayerContext
              value={{
                scene,
                gestures: { selectLink, enterItem, clearHover, isAddMode },
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
                onConnect={readonly ? undefined : onConnect}
                // Only a fusion link offers its ends to drag: each says so itself.
                edgesReconnectable={false}
                {...reconnectProps}
                // The arcs answer for themselves inside their layer: these three
                // are for the fusion links. With no click handler React Flow
                // would take the pointer off the layer's edge.
                onEdgeClick={(_event, edge) => {
                  const fusion = fusionItemOf(edge);
                  if (fusion) {
                    selectLink(fusion);
                  }
                }}
                // Node click selection is handled by ReactFlow's internal
                // handleNodeClick, which fires select changes through
                // onNodesChange; an onNodeClick handler would conflict with it.
                onNodeMouseEnter={(event, node) => enterItem(event, node.id)}
                onNodeMouseLeave={clearHover}
                onNodeDragStart={(_event, node) => hover(node.id)}
                onEdgeMouseEnter={(event, edge) => {
                  const fusion = fusionItemOf(edge);
                  if (fusion) {
                    enterItem(event, fusion.id);
                  }
                }}
                onEdgeMouseLeave={(_event, edge) => {
                  if (fusionItemOf(edge)) {
                    clearHover();
                  }
                }}
                onSelectionStart={interactions.beginSelectionGesture}
                onSelectionEnd={interactions.endSelectionGesture}
                onPaneClick={(event) => clickPane(scenePositionOf(event))}
                // A gesture takes the camera back from any move under way. Frames
                // of the camera's own moves are not remembered, only where it stops,
                // and there the item that waited under the pointer is hovered.
                onMoveStart={(event) => {
                  if (event) {
                    camera.cancel();
                  }
                }}
                onMoveEnd={(_event, viewport) => {
                  if (!camera.isAnimating()) {
                    rememberViewport(viewport);
                    interactions.releasePointer();
                  }
                }}
                onDrop={readonly ? undefined : onDrop}
                onDragOver={readonly ? undefined : onDragOver}
                defaultViewport={savedViewport ?? initialViewport}
                proOptions={{ hideAttribution: true }}
                panOnDrag={isPanMode ? true : isAddMode ? false : [1, 2]}
                selectionOnDrag={interactions.isSelectMode}
                nodesDraggable={!readonly}
                nodesConnectable={!readonly}
                elementsSelectable={!isAddMode}
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
                {showMinimap && presentation.showMinimap && <MiniMap />}
                {!isActualMode && <ViewportControls />}
              </ReactFlow>
            </ArcLayerContext>
          </ArcPulsesContext>
        </LinkRewiringContext>
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
