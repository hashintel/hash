/**
 * Mounts the Deck.gl {@link Scene} in a container, shows a loading overlay until
 * the first structure frame, and wires zoom/fit controls.
 *
 * Generic over node identity: the entity bridge mounts it on a
 * `WorkerHandle` (`NodeId = EntityId`), the type bridge on a
 * `TypeWorkerHandle` (`NodeId = VersionedUrl`). See {@link "./render/scene/handle"}.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GraphControls } from "./components/graph-controls";
import { GRAPH_CAMERA_ZOOM_STEP } from "./interactivity/graph-camera-commands";
import { Scene } from "./render/scene/scene";

import type { SceneHandle } from "./render/scene/handle";
import type {
  ClusterHover,
  FlatEdgeHover,
  HighwayHover,
  LabelPolicy,
  NodeHover,
  NodeLabel,
  NodeSelection,
  SceneOptions,
} from "./render/scene/scene";
import type { EntityId } from "@blockprotocol/type-system";
import type { ReactElement } from "react";

interface GraphVisualizerProps<
  NodeId extends string,
  NodeIndex extends number,
  EdgeIndex extends number,
> {
  readonly handle: SceneHandle<NodeId, NodeIndex, EdgeIndex>;
  readonly loadingComponent: ReactElement;
  /** Accessible name for the graph region; defaults to the entity flavour. */
  readonly ariaLabel?: string;
  readonly onNodeHover?: (hover: NodeHover<NodeId> | null) => void;
  readonly onHighwayHover?: (hover: HighwayHover | null) => void;
  readonly onNodeSelect?: (selection: NodeSelection<NodeId> | null) => void;
  /** Open the underlying link entities of an aggregated "highway" edge in a table. */
  readonly onOpenLinkTable?: (linkNodeIds: readonly NodeId[]) => void;
  /** Report a hovered wholly-frontier cluster bubble (to offer loading its entities), or null on leave. */
  readonly onClusterHover?: (hover: ClusterHover | null) => void;
  /** Report a hovered non-node flat edge (a type graph's link-type edge), or null on leave. */
  readonly onEdgeHover?: (hover: FlatEdgeHover<NodeId> | null) => void;
  /**
   * Resolve a node's display label (its name) for always-on graph labels.
   * Invoked when the label set is rebuilt (zoom / structure change), never per frame.
   */
  readonly resolveNodeLabel?: (nodeId: NodeId) => string | undefined;
  /**
   * Resolve a node's type icon to an atlas key (emoji or image URL), or null for none.
   * Invoked when the flat-tier icon set is rebuilt (structure change), never per frame.
   */
  readonly resolveNodeIcon?: (nodeId: NodeId) => string | null;
  /** Receive the always-on hub labels (with current on-screen positions) to overlay as HTML. */
  readonly onNodeLabels?: (labels: readonly NodeLabel<NodeId>[]) => void;
  /** Which dots get always-on labels; omit for the entity-hub defaults. */
  readonly labelPolicy?: Partial<LabelPolicy>;
  /**
   * Surface the live {@link Scene} to debug consumers (the dev harness render
   * benchmark drives captures and camera sweeps through it). Called with null
   * on unmount.
   */
  readonly onSceneReady?: (
    scene: Scene<NodeId, NodeIndex, EdgeIndex> | null,
  ) => void;
}

export const GraphVisualizer = <
  NodeId extends string = EntityId,
  NodeIndex extends number = number,
  EdgeIndex extends number = number,
>({
  handle,
  loadingComponent,
  ariaLabel = "Entity relationship graph",
  onNodeHover,
  onHighwayHover,
  onNodeSelect,
  onOpenLinkTable,
  onClusterHover,
  onEdgeHover,
  resolveNodeLabel,
  resolveNodeIcon,
  onNodeLabels,
  labelPolicy,
  onSceneReady,
}: GraphVisualizerProps<NodeId, NodeIndex, EdgeIndex>): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene<NodeId, NodeIndex, EdgeIndex> | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const handleFirstStructure = useCallback(() => setHasStructure(true), []);

  // The scene reads the policy once at mount; a mid-session policy change is
  // not a supported flow (hosts pass a constant).
  const sceneOptions = useMemo<SceneOptions>(
    () => ({ labelPolicy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // A new handle means a fresh worker with no committed structure yet: show
    // the loading overlay again until its first structure frame arrives.
    setHasStructure(false);

    const scene = new Scene<NodeId, NodeIndex, EdgeIndex>(
      container,
      handle,
      {
        onNodeHover,
        onHighwayHover,
        onNodeSelect,
        onOpenLinkTable,
        onClusterHover,
        onEdgeHover,
        resolveNodeLabel,
        resolveNodeIcon,
        onNodeLabels,
        onFirstStructure: handleFirstStructure,
      },
      sceneOptions,
    );
    sceneRef.current = scene;
    onSceneReady?.(scene);

    return () => {
      onSceneReady?.(null);
      scene.dispose();
      sceneRef.current = null;
    };
    // Only `handle` re-mounts the scene; callbacks are kept current below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // Keep the scene's interaction callbacks current without re-mounting Deck.
  useEffect(() => {
    sceneRef.current?.setCallbacks({
      onNodeHover,
      onHighwayHover,
      onNodeSelect,
      onOpenLinkTable,
      onClusterHover,
      onEdgeHover,
      resolveNodeLabel,
      resolveNodeIcon,
      onNodeLabels,
      onFirstStructure: handleFirstStructure,
    });
  }, [
    onNodeHover,
    onHighwayHover,
    onNodeSelect,
    onOpenLinkTable,
    onClusterHover,
    onEdgeHover,
    resolveNodeLabel,
    resolveNodeIcon,
    onNodeLabels,
    handleFirstStructure,
  ]);

  return (
    <div
      role="application"
      aria-label={ariaLabel}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
      />
      {!hasStructure && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          {loadingComponent}
        </div>
      )}
      <GraphControls
        onZoomIn={() => sceneRef.current?.zoomBy(GRAPH_CAMERA_ZOOM_STEP)}
        onZoomOut={() => sceneRef.current?.zoomBy(-GRAPH_CAMERA_ZOOM_STEP)}
        onFitView={() => sceneRef.current?.fitToContent()}
      />
    </div>
  );
};
