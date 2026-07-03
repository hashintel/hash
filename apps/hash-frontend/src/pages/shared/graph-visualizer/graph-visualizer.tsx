/**
 * Mounts the Deck.gl {@link Scene} in a container, shows a loading overlay until
 * the first structure frame, and wires zoom/fit controls.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { GraphControls } from "./components/graph-controls";
import { GRAPH_CAMERA_ZOOM_STEP } from "./interactivity/graph-camera-commands";
import { Scene } from "./render/scene";

import type {
  ClusterHover,
  EntityHover,
  EntityLabel,
  EntitySelection,
  HighwayHover,
} from "./render/scene";
import type { WorkerHandle } from "./render/entity-worker-connection";
import type { EntityId } from "@blockprotocol/type-system";
import type { ReactElement } from "react";

interface GraphVisualizerProps {
  readonly handle: WorkerHandle;
  readonly loadingComponent: ReactElement;
  readonly onEntityHover?: (hover: EntityHover | null) => void;
  readonly onHighwayHover?: (hover: HighwayHover | null) => void;
  readonly onEntitySelect?: (selection: EntitySelection | null) => void;
  /** Open the underlying link entities of an aggregated "highway" edge in a table. */
  readonly onOpenLinkTable?: (linkEntityIds: readonly EntityId[]) => void;
  /** Report a hovered wholly-frontier cluster bubble (to offer loading its entities), or null on leave. */
  readonly onClusterHover?: (hover: ClusterHover | null) => void;
  /**
   * Resolve an entity's display label (its name) for always-on graph labels.
   * Invoked when the label set is rebuilt (zoom / structure change), never per frame.
   */
  readonly resolveEntityLabel?: (entityId: EntityId) => string | undefined;
  /**
   * Resolve an entity's type icon to an atlas key (emoji or image URL), or null for none.
   * Invoked when the flat-tier icon set is rebuilt (structure change), never per frame.
   */
  readonly resolveEntityIcon?: (entityId: EntityId) => string | null;
  /** Receive the always-on hub labels (with current on-screen positions) to overlay as HTML. */
  readonly onEntityLabels?: (labels: readonly EntityLabel[]) => void;
  /**
   * Surface the live {@link Scene} to debug consumers (the dev harness render
   * benchmark drives captures and camera sweeps through it). Called with null
   * on unmount.
   */
  readonly onSceneReady?: (scene: Scene | null) => void;
}

export const GraphVisualizer: React.FC<GraphVisualizerProps> = ({
  handle,
  loadingComponent,
  onEntityHover,
  onHighwayHover,
  onEntitySelect,
  onOpenLinkTable,
  onClusterHover,
  resolveEntityLabel,
  resolveEntityIcon,
  onEntityLabels,
  onSceneReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const handleFirstStructure = useCallback(() => setHasStructure(true), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // A new handle means a fresh worker with no committed structure yet: show
    // the loading overlay again until its first structure frame arrives.
    setHasStructure(false);

    const scene = new Scene(container, handle, {
      onEntityHover,
      onHighwayHover,
      onEntitySelect,
      onOpenLinkTable,
      onClusterHover,
      resolveEntityLabel,
      resolveEntityIcon,
      onEntityLabels,
      onFirstStructure: handleFirstStructure,
    });
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
      onEntityHover,
      onHighwayHover,
      onEntitySelect,
      onOpenLinkTable,
      onClusterHover,
      resolveEntityLabel,
      resolveEntityIcon,
      onEntityLabels,
      onFirstStructure: handleFirstStructure,
    });
  }, [
    onEntityHover,
    onHighwayHover,
    onEntitySelect,
    onOpenLinkTable,
    onClusterHover,
    resolveEntityLabel,
    resolveEntityIcon,
    onEntityLabels,
    handleFirstStructure,
  ]);

  return (
    <div
      role="application"
      aria-label="Entity relationship graph"
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
