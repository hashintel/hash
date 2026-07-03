/**
 * Production bridge from the types page's ontology data to the type-graph
 * worker lifecycle (`INIT_TYPE`) and overlay UI -- the type mirror of
 * `entity-graph/visualizer.tsx`, and the drop-in replacement for the old
 * sigma-based type graph.
 *
 * It maps schemas to nodes/edges (`build-graph.ts`), feeds them to the worker
 * (`use-worker.ts`), and renders the HTML overlays. The Scene's per-frame
 * position reports flow through the {@link SceneOverlayStore} into leaf
 * overlay components, so this component itself re-renders only when the type
 * data changes.
 */
import { Box } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { FrontierControls } from "../components/frontier-controls";
import { GraphStatusOverlay } from "../components/graph-status-overlay";
import { SceneOverlayStore } from "../components/scene-overlay-store";
import { GraphVisualizer } from "../graph-visualizer";
import { useSimulationPause } from "../interactivity/use-simulation-pause";
import { ANYTHING_NODE_URL, buildTypeGraph } from "./build-graph";
import {
  TypeEdgeHoverOverlay,
  TypeHoverOverlay,
  TypeLabelsOverlay,
  TypeSelectionOverlay,
} from "./overlays";
import { useTypeFrontierExpansion } from "./use-frontier-expansion";
import { useTypeGraphWorker } from "./use-worker";

import type { NodeSelection } from "../render/scene/callbacks";
import type { LabelPolicy } from "../render/scene/scene";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

interface TypeGraphVisualizerProps {
  readonly types: readonly (
    | DataTypeWithMetadata
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
  )[];
  /** Open a type's page/slide, wired to the selection card's Open action. */
  readonly onTypeClick: (typeId: VersionedUrl) => void;
}

/**
 * Label every node (the entity policy labels only hubs): at ontology scale
 * dots are meaningless without names. HubLabels' collision culling still
 * applies, so dense areas thin out rather than overlap.
 */
const TYPE_LABEL_POLICY: Partial<LabelPolicy> = {
  minRadius: 0,
  maxCount: Number.POSITIVE_INFINITY,
  minScreenDiameter: 0,
};

export const TypeGraphVisualizer: React.FC<TypeGraphVisualizerProps> = memo(
  ({ types, onTypeClick }) => {
    const { entityTypes, isSpecialEntityTypeLookup } =
      useEntityTypesContextRequired();

    const knownSchemaUrls = useMemo(
      () => new Set((entityTypes ?? []).map(({ schema }) => schema.$id)),
      [entityTypes],
    );
    const isSchemaKnown = useCallback(
      (url: VersionedUrl) => knownSchemaUrls.has(url),
      [knownSchemaUrls],
    );

    const frontier = useTypeFrontierExpansion({ isSchemaKnown });

    const graph = useMemo(
      () =>
        buildTypeGraph({
          types,
          allEntityTypes: entityTypes,
          isSpecialEntityTypeLookup,
          expandedUrls: frontier.expandedUrls,
          fetchedSchemas: frontier.fetchedSchemas,
        }),
      [
        types,
        entityTypes,
        isSpecialEntityTypeLookup,
        frontier.expandedUrls,
        frontier.fetchedSchemas,
      ],
    );

    /** Frontier nodes still expandable (the synthetic Anything node is not). */
    const frontierUrls = useMemo(
      () =>
        [...graph.displayInfoByUrl]
          .filter(
            ([url, info]) =>
              !info.isLoaded &&
              info.kind !== "anything" &&
              !frontier.expandedUrls.has(url),
          )
          .map(([url]) => url),
      [graph, frontier.expandedUrls],
    );

    // The displayed type SET is the worker's source identity: ingest is
    // additive (no retract), so a different set -- a filter change -- must
    // recreate the worker for a clean re-ingest. Same set, richer context
    // (e.g. the entity-types context finishing its load) keeps the worker and
    // re-ingests idempotently.
    const resetKey = useMemo(
      () =>
        types
          .map(({ schema }) => schema.$id)
          .sort()
          .join("|"),
      [types],
    );

    const { handle, ready, error } = useTypeGraphWorker({ resetKey });

    useEffect(() => {
      if (handle && ready && graph.nodes.length > 0) {
        handle.ingestTypes(graph.nodes, graph.edges, graph.linkTypeSchemas);
      }
    }, [handle, ready, graph]);

    const containerRef = useSimulationPause({
      handle,
      ready,
      occluded: false,
    });

    const [overlayStore] = useState(
      () => new SceneOverlayStore<VersionedUrl>(),
    );
    // A recreated worker gets a fresh Scene: clear the old scene's overlay
    // reports so nothing stale lingers over the new canvas.
    useEffect(
      () => () => {
        overlayStore.reset();
      },
      [overlayStore, handle],
    );

    const getDisplayInfo = useCallback(
      (url: VersionedUrl) => graph.displayInfoByUrl.get(url),
      [graph],
    );

    const resolveNodeLabel = useCallback(
      (url: VersionedUrl) => graph.displayInfoByUrl.get(url)?.title,
      [graph],
    );

    const resolveNodeIcon = useCallback(
      (url: VersionedUrl) => graph.displayInfoByUrl.get(url)?.icon ?? null,
      [graph],
    );

    // Reads the live slice so the handler stays referentially stable while
    // the selection tracks pan frames.
    const openSelectedType = useCallback(() => {
      const selection = overlayStore.selection.getValue();

      if (selection && selection.nodeId !== ANYTHING_NODE_URL) {
        onTypeClick(selection.nodeId);
      }
    }, [overlayStore, onTypeClick]);

    const { expandTypes } = frontier;

    // Selecting a frontier node expands it: fetch its schema (if needed) and
    // walk its links into the graph on the rebuild that follows. Loaded nodes
    // just select, and therefore no expansion churn.
    const handleNodeSelect = useCallback(
      (selection: NodeSelection<VersionedUrl> | null) => {
        overlayStore.selection.setValue(selection);
        if (selection && selection.nodeId !== ANYTHING_NODE_URL) {
          const info = graph.displayInfoByUrl.get(selection.nodeId);
          if (info && !info.isLoaded) {
            expandTypes([selection.nodeId]);
          }
        }
      },
      [overlayStore, expandTypes, graph],
    );

    const expandAllFrontier = useCallback(() => {
      expandTypes(frontierUrls);
    }, [expandTypes, frontierUrls]);

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
        <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
          <GraphStatusOverlay
            title="Preparing type graph"
            description="Setting up the layout worker."
          />
        </Box>
      );
    }

    if (ready && graph.nodes.length === 0) {
      return (
        <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
          <GraphStatusOverlay
            variant="empty"
            title="No entity types to visualize"
            description="Change the filters to include entity types with links between them."
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
          ariaLabel="Entity type relationship graph"
          loadingComponent={
            <GraphStatusOverlay
              title="Laying out the type graph"
              description="Computing positions for types and their links."
            />
          }
          onNodeHover={overlayStore.nodeHover.setValue}
          onNodeSelect={handleNodeSelect}
          onEdgeHover={overlayStore.edgeHover.setValue}
          resolveNodeLabel={resolveNodeLabel}
          resolveNodeIcon={resolveNodeIcon}
          onNodeLabels={overlayStore.nodeLabels.setValue}
          labelPolicy={TYPE_LABEL_POLICY}
        />
        <FrontierControls
          frontierCount={frontierUrls.length}
          isFetching={frontier.pendingCount > 0}
          fetchedCount={frontier.fetchedSchemas.size}
          totalToFetch={frontier.fetchedSchemas.size + frontier.pendingCount}
          error={frontier.error}
          noun="type"
          onFetchCompleteFrontier={expandAllFrontier}
        />
        <TypeLabelsOverlay overlayStore={overlayStore} />
        <TypeHoverOverlay
          overlayStore={overlayStore}
          getDisplayInfo={getDisplayInfo}
        />
        <TypeEdgeHoverOverlay
          overlayStore={overlayStore}
          getDisplayInfo={getDisplayInfo}
        />
        <TypeSelectionOverlay
          overlayStore={overlayStore}
          getDisplayInfo={getDisplayInfo}
          onOpen={openSelectedType}
        />
      </Box>
    );
  },
);
