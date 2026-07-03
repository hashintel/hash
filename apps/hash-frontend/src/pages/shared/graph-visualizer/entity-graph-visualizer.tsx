/**
 * Production bridge from Hash entity query results to the graph worker and overlay
 * UI: ingests entities, drives frontier expansion, and renders hover/selection cards.
 *
 * It feeds entities into the worker (`use-entity-ingest.ts`), expands the frontier on
 * demand (`frontier-expansion-store.ts`), resolves display fields
 * (`use-entity-display.ts`), and renders the HTML overlays. The Scene's per-frame
 * position reports flow through the {@link SceneOverlayStore} into leaf overlay
 * components, so this component itself re-renders only when data (not the camera)
 * changes.
 */
import { Box } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { FrontierControls } from "./components/frontier-controls";
import { FrontierLegend } from "./components/frontier-legend";
import { GraphGuidanceCard } from "./components/graph-guidance-card";
import { GraphStatusOverlay } from "./components/graph-status-overlay";
import {
  extractPropertySchemas,
  extractTypeSchemas,
} from "./components/ingest-mapping";
import { SceneOverlayStore } from "./components/scene-overlay-store";
import {
  ClusterHoverOverlay,
  EntityHoverOverlay,
  EntityLabelsOverlay,
  HighwayHoverOverlay,
  SelectionOverlay,
} from "./components/scene-overlays";
import { useEntityDisplay } from "./components/use-entity-display";
import { useEntityIngest } from "./components/use-entity-ingest";
import { useFrontierExpansion } from "./components/use-frontier-expansion";
import { GraphVisualizer } from "./graph-visualizer";
import { useGraphGuidanceDismissal } from "./interactivity/use-graph-guidance-dismissal";
import { useSimulationPause } from "./interactivity/use-simulation-pause";
import { useLayoutFixtureCaptureHook } from "./layout-fixture-capture";
import { useGraphWorker } from "./render/use-graph-worker";

import type { FrontierExpansionStore } from "./components/frontier-expansion-store";
import type { VizConfig } from "./config";
import type { EntitySelection, Scene } from "./render/scene";
import type { WorkerHandle } from "./render/worker-connection";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import type { ReactElement } from "react";

interface EntityGraphVisualizerProps {
  readonly entities?: HashEntity[];
  /**
   * EntityIds of the query roots. Any entity in `entities` not in this set is a frontier node -- a
   * fetched link endpoint rendered greyed-out until expanded. Omit to treat every entity as a root
   * (no frontier).
   */
  readonly rootEntityIds?: readonly EntityId[];
  readonly closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  // The full type-definition map (every referenced type, including inherited
  // ancestors, with titles). Required so the worker learns about parent types
  // that no entity uses directly; see {@link extractTypeSchemas}.
  readonly definitions?: ClosedMultiEntityTypesDefinitions;
  readonly loadingComponent: ReactElement;
  /** Open an entity, wired to clicking a flat-tier dot (resolved via the join key). */
  readonly onEntityClick?: (entityId: EntityId) => void;
  /** Open the underlying link entities of an aggregated "highway" edge in a table. */
  readonly onOpenLinkTable?: (linkEntityIds: readonly EntityId[]) => void;
  /**
   * Override the worker's layout/scale config; omit to use the defaults. May
   * change while mounted: a new reference is applied to the live worker
   * (which re-tunes and re-lays out in place), keeping graph and camera.
   */
  readonly config?: VizConfig;
  /**
   * A stable identity for the data source (the query/filter behind `entities`), not the result.
   * `entities` streaming in for the same source keeps this constant; a filter change flips it. The
   * worker's ingest is additive (no retract), so a changed key recreates it for a clean re-ingest.
   * Omit (e.g. a fixed ego graph) to never recreate -- `entities` is then assumed append-only.
   */
  readonly sourceKey?: string;
  /**
   * True while other UI is layered over this visualizer (a slide covering the page, a slide
   * covered by a later slide): occlusion only the caller can know about. While not visible
   * (this, a hidden tab, or scrolled out of view) the worker's simulation is paused: no CPU
   * spent settling layouts, resuming from the same positions when visible again.
   */
  readonly occluded?: boolean;
  /**
   * Frontier-expansion state, owned by the surface that owns the entity query (create it with
   * `useOwnedFrontierStore`, keyed to the query's identity). Owned above this component so
   * expansions persist across view switches and worker recreations; this component attaches
   * the store to each worker it creates, replaying committed expansions into it.
   */
  readonly frontierStore: FrontierExpansionStore;
  /**
   * Debug affordance: receives the live {@link WorkerHandle} (undefined on teardown) so debug
   * surfaces outside the visualizer (the dev harness) can issue worker queries, e.g. the
   * capture-live-fixture hook (`handle.captureLayoutFixture()`).
   */
  readonly onWorkerHandle?: (handle: WorkerHandle | undefined) => void;
  /**
   * Debug affordance: receives the live {@link Scene} (null on teardown) so
   * the dev harness render benchmark can drive captures and camera sweeps.
   */
  readonly onSceneReady?: (scene: Scene | null) => void;
}

export const EntityGraphVisualizer: React.FC<EntityGraphVisualizerProps> = memo(
  ({
    entities,
    rootEntityIds,
    closedMultiEntityTypesRootMap,
    definitions,
    loadingComponent,
    onEntityClick,
    onOpenLinkTable,
    config,
    sourceKey,
    occluded = false,
    frontierStore,
    onWorkerHandle,
    onSceneReady,
  }) => {
    const typeSchemas = useMemo(
      () =>
        extractTypeSchemas(
          entities ?? [],
          closedMultiEntityTypesRootMap,
          definitions,
        ),
      [entities, closedMultiEntityTypesRootMap, definitions],
    );

    const propertySchemas = useMemo(
      () => extractPropertySchemas(definitions),
      [definitions],
    );

    const rootIdSet = useMemo(
      () => (rootEntityIds ? new Set(rootEntityIds) : undefined),
      [rootEntityIds],
    );

    // The data source's identity drives a worker recreate: a changed `sourceKey` (filter change)
    // purges the additive worker, since it can't retract the old set. Same key -> `entities` only
    // grows, streamed as a tail append.
    const { handle, ready, error } = useGraphWorker({
      config,
      typeSchemas,
      propertySchemas,
      resetKey: sourceKey,
    });

    // Forward the live worker handle whenever it changes so debug tooling can query
    // layout state.
    useEffect(() => {
      onWorkerHandle?.(handle);
      return () => {
        onWorkerHandle?.(undefined);
      };
    }, [handle, onWorkerHandle]);

    // Console debug hook (all surfaces, prod included): dump the live layout
    // as a replayable fixture via `__hashGraphCaptureLayoutFixture()`.
    useLayoutFixtureCaptureHook(handle);

    useEntityIngest({
      handle,
      ready,
      entities,
      schemasRegistered: typeSchemas.length > 0,
      rootIdSet,
    });

    const containerRef = useSimulationPause({ handle, ready, occluded });

    const { snapshot: frontier, frontierEntityIds } = useFrontierExpansion({
      store: frontierStore,
      handle,
      entities,
      rootIdSet,
    });

    const [overlayStore] = useState(() => new SceneOverlayStore());
    // A recreated worker gets a fresh Scene: clear the old scene's overlay reports (and
    // the cluster card's grace timer) so nothing stale lingers over the new canvas.
    useEffect(
      () => () => {
        overlayStore.reset();
      },
      [overlayStore, handle],
    );

    const {
      getCardContext,
      resolveEntityLabel,
      resolveEntityIcon,
      degreeById,
    } = useEntityDisplay({
      entities,
      closedMultiEntityTypesRootMap,
      definitions,
      frontierStore,
      expandedById: frontier.expandedById,
    });

    const { shouldShowGuidance, dismissGuidance } = useGraphGuidanceDismissal();

    const expandFrontier = useCallback(
      (entityIds: readonly EntityId[]) => {
        void frontierStore.expand(entityIds);
      },
      [frontierStore],
    );

    const fetchCompleteFrontier = useCallback(() => {
      void frontierStore.expand(frontierEntityIds);
    }, [frontierStore, frontierEntityIds]);

    const handleEntitySelect = useCallback(
      (selection: EntitySelection | null) => {
        overlayStore.selection.setValue(selection);
        // Selecting a frontier node also expands its neighbourhood; the store dedupes,
        // so the Scene's per-frame re-emission of the selection expands at most once.
        if (selection && rootIdSet && !rootIdSet.has(selection.entityId)) {
          void frontierStore.expand([selection.entityId]);
        }
      },
      [overlayStore, frontierStore, rootIdSet],
    );

    if (error) {
      return (
        <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
          <GraphStatusOverlay
            variant="error"
            title="Graph worker error"
            description={error}
          />
        </Box>
      );
    }

    if (!handle) {
      return (
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
          }}
        >
          {loadingComponent}
          <GraphStatusOverlay
            title="Loading graph data"
            description="Fetching entities and relationships for the graph."
          />
        </Box>
      );
    }

    if (ready && (entities?.length ?? 0) === 0) {
      return (
        <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
          <GraphStatusOverlay
            variant="empty"
            title="No entities to visualize"
            description="Change the query or filters to build a relationship graph."
          />
        </Box>
      );
    }

    return (
      <Box
        ref={containerRef}
        sx={{ position: "relative", width: "100%", height: "100%" }}
      >
        <GraphVisualizer
          handle={handle}
          loadingComponent={
            <GraphStatusOverlay
              title="Fetching connected entities"
              description="Existing graph content stays visible while new data loads."
            />
          }
          onEntityHover={overlayStore.entityHover.setValue}
          onHighwayHover={overlayStore.highwayHover.setValue}
          onEntitySelect={handleEntitySelect}
          onClusterHover={overlayStore.handleClusterHover}
          onOpenLinkTable={onOpenLinkTable}
          resolveEntityLabel={resolveEntityLabel}
          resolveEntityIcon={resolveEntityIcon}
          onEntityLabels={overlayStore.entityLabels.setValue}
          onSceneReady={onSceneReady}
        />
        <FrontierControls
          frontierCount={frontierEntityIds.length}
          isFetching={frontier.progress.fetching}
          fetchedCount={frontier.progress.done}
          totalToFetch={frontier.progress.total}
          error={frontier.error}
          onFetchCompleteFrontier={fetchCompleteFrontier}
        />
        {shouldShowGuidance ? (
          <GraphGuidanceCard onDismiss={dismissGuidance} />
        ) : (
          <FrontierLegend />
        )}
        <EntityLabelsOverlay overlayStore={overlayStore} />
        <EntityHoverOverlay
          overlayStore={overlayStore}
          getCardContext={getCardContext}
          degreeById={degreeById}
        />
        <HighwayHoverOverlay
          overlayStore={overlayStore}
          closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
        />
        <ClusterHoverOverlay
          overlayStore={overlayStore}
          isFetching={frontier.progress.fetching}
          onLoadFrontier={expandFrontier}
        />
        <SelectionOverlay
          overlayStore={overlayStore}
          getCardContext={getCardContext}
          degreeById={degreeById}
          onEntityClick={onEntityClick}
        />
      </Box>
    );
  },
);
