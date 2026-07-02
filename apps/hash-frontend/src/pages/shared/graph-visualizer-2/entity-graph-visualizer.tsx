/**
 * Drop-in replacement for EntityGraphVisualizer that uses the
 * Deck.gl-based graph visualization (v2).
 *
 * Bridges HashEntity data into the worker's IngestEntity format
 * and renders cluster bubbles.
 */
import { Box } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

import { EntityHoverCard } from "./components/entity-hover-card";
import { EntityLabelOverlay } from "./components/entity-label-overlay";
import { FrontierClusterCard } from "./components/frontier-cluster-card";
import { FrontierControls } from "./components/frontier-controls";
import { FrontierLegend } from "./components/frontier-legend";
import { GraphGuidanceCard } from "./components/graph-guidance-card";
import { GraphStatusOverlay } from "./components/graph-status-overlay";
import { HighwaySummaryCard } from "./components/highway-summary-card";
import { fetchFrontierExpansion } from "./fetch-frontier-expansion";
import { GraphVisualizerV2 } from "./graph-visualizer";
import {
  freshFrontierIds,
  frontierExpansionBatches,
} from "./interactivity/frontier-expansion";
import { useGraphGuidanceDismissal } from "./interactivity/use-graph-guidance-dismissal";
import { useGraphWorker } from "./render/use-graph-worker";

import type { VizConfig } from "./config";
import type {
  ClusterHover,
  EntityLabel,
  EntitySelection,
  HighwayHover,
  Scene,
} from "./render/scene";
import type { WorkerHandle } from "./render/worker-connection";
import type {
  IngestEntity,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "./worker/protocol";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import type { ReactElement } from "react";

interface EntityGraphVisualizerV2Props {
  readonly entities?: HashEntity[];
  /**
   * EntityIds of the query ROOTS. Any entity in `entities` not in this set is a FRONTIER node -- a
   * fetched link endpoint rendered greyed-out until expanded. Omit to treat every entity as a root
   * (no frontier).
   */
  readonly rootEntityIds?: readonly EntityId[];
  readonly closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  // The full type-definition map (every referenced type, including inherited
  // ancestors, with titles). Required so the worker learns about parent types
  // that no entity uses directly — see {@link extractTypeSchemas}.
  readonly definitions?: ClosedMultiEntityTypesDefinitions;
  readonly loadingComponent: ReactElement;
  /** Open an entity, wired to clicking a flat-tier dot (resolved via the join key). */
  readonly onEntityClick?: (entityId: EntityId) => void;
  /** Open the underlying link entities of an aggregated "highway" edge in a table. */
  readonly onOpenLinkTable?: (linkEntityIds: readonly EntityId[]) => void;
  /** Override the worker's layout/scale config; omit to use the defaults. */
  readonly config?: VizConfig;
  /**
   * A stable identity for the data SOURCE (the query/filter behind `entities`), NOT the result.
   * `entities` streaming in for the same source keeps this constant; a filter change flips it. The
   * worker's ingest is additive (no retract), so a changed key recreates it for a clean re-ingest.
   * Omit (e.g. a fixed ego graph) to never recreate -- `entities` is then assumed append-only.
   */
  readonly sourceKey?: string;
  /**
   * Debug affordance: receives the live {@link WorkerHandle} (undefined on teardown) so debug
   * surfaces outside the visualizer (the dev harness) can issue worker queries — e.g. the
   * CAPTURE-LIVE-FIXTURE hook (`handle.captureLayoutFixture()`).
   */
  readonly onWorkerHandle?: (handle: WorkerHandle | undefined) => void;
  /**
   * Debug affordance: receives the live {@link Scene} (null on teardown) so
   * the dev harness render benchmark can drive captures and camera sweeps.
   */
  readonly onSceneReady?: (scene: Scene | null) => void;
}

/**
 * A hovered/selected entity's data plus the type maps its card needs. For a freshly-expanded node
 * (not in the prop `entities`) this is the expansion it arrived in, since the prop maps don't cover
 * it; for a prop entity it is just the prop maps.
 */
interface EntityCardContext {
  readonly entity: HashEntity;
  readonly rootMap: ClosedMultiEntityTypesRootMap | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
}

function toIngestEntities(
  entities: HashEntity[],
  rootIds: ReadonlySet<EntityId> | undefined,
): IngestEntity[] {
  return entities.map((entity) => {
    const entityId = entity.metadata.recordId.entityId;
    const isLink = entity.linkData !== undefined;
    return {
      entityId,
      entityTypeIds: entity.metadata.entityTypeIds as VersionedUrl[],
      isLink,
      // A link is never a root. With no root set, every node is a root (no frontier); otherwise
      // root-ness is set membership -- non-members render as greyed-out frontier nodes.
      isRoot: !isLink && (rootIds === undefined || rootIds.has(entityId)),
      linkData: entity.linkData,
      // Property values, for NODE entities only, so the worker can name embedding clusters
      // by their distinctive shared properties. Links are never embedding-clustered.
      properties: isLink ? undefined : entity.properties,
    };
  });
}

/**
 * Best-effort human title from a versioned type URL (".../entity-type/<slug>/v/N").
 * Used only as a fallback when an ancestor type is absent from `definitions`, so
 * a registered parent never ends up with an empty title.
 */
function titleFromUrl(versionedUrl: VersionedUrl): string {
  const slug = /\/entity-type\/(?<slug>[^/]+)\//.exec(versionedUrl)?.groups
    ?.slug;
  if (!slug) {
    return "";
  }
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Build one {@link TypeSchemaEntry} per unique VersionedUrl reachable from the
 * entities' types — INCLUDING inherited ancestor types that no entity uses
 * directly.
 *
 * Each `entry.allOf` is the inheritance chain of a directly-applied type: the
 * type itself at depth 0 followed by its ancestors. Those ancestor entries are
 * {@link EntityTypeDisplayMetadata} — they carry `$id`/`depth`/`icon` but NO
 * title — so titles for ancestors are looked up in `definitions.entityTypes`.
 *
 * We register every type in the chain, not just the leaf. Previously only the
 * leaf was registered and its ancestors were pushed as bare parent refs; the
 * worker then interned a parent URL (e.g. a shared "Company" supertype) but had
 * no TypeInfo for it, so root resolution silently produced no root and every
 * such child fell into the catch-all "unknown" bucket (rendering as a nameless
 * "Other" rollup). Registering ancestors lets the worker resolve a real root
 * and group/label them correctly.
 */
function extractTypeSchemas(
  entities: HashEntity[],
  typeMap: ClosedMultiEntityTypesRootMap | undefined,
  definitions: ClosedMultiEntityTypesDefinitions | undefined,
): TypeSchemaEntry[] {
  if (!typeMap) {
    return [];
  }

  const seen = new Map<VersionedUrl, TypeSchemaEntry>();

  for (const entity of entities) {
    let closedType;
    try {
      closedType = getClosedMultiEntityTypeFromMap(
        typeMap,
        entity.metadata.entityTypeIds,
      );
    } catch {
      continue;
    }

    for (const entry of closedType.allOf) {
      // Chain ordered shallow-to-deep: index 0 is the type itself, the rest are
      // its ancestors (closest first).
      const chain = [...entry.allOf].sort((a, b) => a.depth - b.depth);

      for (let depthIdx = 0; depthIdx < chain.length; depthIdx++) {
        const node = chain[depthIdx]!;
        if (seen.has(node.$id)) {
          continue;
        }

        // Deeper entries are this type's ancestors. Pointing at all of them
        // (not only the direct parent) over-approximates the inheritance DAG
        // with transitive edges — harmless for the worker's root resolution
        // (root = union of parents' roots) and robust to multiple inheritance
        // without reconstructing the DAG here.
        const allOfRefs = chain
          .slice(depthIdx + 1)
          .map((ancestor) => ancestor.$id);

        const definition = definitions?.entityTypes[node.$id];

        seen.set(node.$id, {
          url: node.$id,
          // Leaf has its title on `entry`; ancestors come via `definitions`,
          // falling back to the URL slug so a parent is never title-less.
          title:
            definition?.title ??
            (depthIdx === 0 ? entry.title : titleFromUrl(node.$id)),
          // Link types carry an inverse (target -> source) title; the leaf has it on `entry`,
          // ancestors via `definitions`. Undefined for non-link types (no inverse).
          inverseTitle:
            definition?.inverse?.title ??
            (depthIdx === 0 ? entry.inverse?.title : undefined),
          icon: node.icon ?? definition?.icon,
          allOfRefs,
        });
      }
    }
  }

  return [...seen.values()];
}

/**
 * Property display titles keyed by base URL, for every property type referenced by the
 * loaded entities. Shipped to the worker so a distinctive-feature cluster label reads
 * "Destination = ..." with the human title rather than a raw base URL. The worker holds
 * the property VALUES (on the ingested entities); this supplies their names.
 */
function extractPropertySchemas(
  definitions: ClosedMultiEntityTypesDefinitions | undefined,
): PropertySchemaEntry[] {
  if (!definitions) {
    return [];
  }

  const seen = new Map<string, PropertySchemaEntry>();
  for (const propertyType of Object.values(definitions.propertyTypes)) {
    const baseUrl = extractBaseUrl(propertyType.$id);
    if (!seen.has(baseUrl)) {
      seen.set(baseUrl, { baseUrl, title: propertyType.title });
    }
  }
  return [...seen.values()];
}

export const EntityGraphVisualizerV2 = memo(
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
    onWorkerHandle,
    onSceneReady,
  }: EntityGraphVisualizerV2Props) => {
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
    // grows, streamed as a tail append below.
    const { handle, ready, error } = useGraphWorker({
      config,
      typeSchemas,
      propertySchemas,
      resetKey: sourceKey,
    });
    // Surface the live handle to debug consumers (dev harness capture hook).
    useEffect(() => {
      onWorkerHandle?.(handle);
      return () => {
        onWorkerHandle?.(undefined);
      };
    }, [handle, onWorkerHandle]);
    const { shouldShowGuidance, dismissGuidance } = useGraphGuidanceDismissal();

    const [hover, setHover] = useState<{
      readonly entityId: EntityId;
      readonly x: number;
      readonly y: number;
    } | null>(null);

    const [highwayHover, setHighwayHover] = useState<HighwayHover | null>(null);

    // The hovered wholly-frontier cluster, shown as an interactive load card. Unlike the other hover
    // cards this one has a button, so it stays open while the cursor is over the bubble OR the card:
    // a leave starts a short grace timer that the card's own enter cancels, the standard
    // interactive-tooltip handoff. The latest frontier ids ride a ref so the Load handler stays stable.
    const [clusterHover, setClusterHover] = useState<ClusterHover | null>(null);
    const clusterCardHoveredRef = useRef(false);
    const clusterCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const clusterFrontierIdsRef = useRef<readonly EntityId[]>([]);

    // The always-on hub labels overlaid as HTML, re-emitted by the Scene each frame with their
    // current on-screen positions so they track the camera + settling layout.
    const [entityLabels, setEntityLabels] = useState<readonly EntityLabel[]>(
      [],
    );
    const inFlightFrontierRef = useRef(new Set<EntityId>());
    const [frontierVersion, setFrontierVersion] = useState(0);
    const [frontierError, setFrontierError] = useState<string | undefined>();
    const [frontierProgress, setFrontierProgress] = useState({
      done: 0,
      total: 0,
      fetching: false,
    });

    // How many of `entities` have been handed to the worker. `entities` is append-only within one
    // data source (see `sourceKey`); a source change recreates the worker, which resets this.
    const sentCountRef = useRef(0);
    // Bumped on every worker reset. In-flight frontier expansions capture the value at start and
    // compare after each await: a mismatch means their results belong to a torn-down worker and
    // must not leak into the fresh generation's mirrors (expandedRootsRef, expandedByIdRef).
    const workerGenerationRef = useRef(0);
    // Frontier nodes the user has already expanded. Tracked locally because the worker learns
    // their root-ness via ingest, but the bridge's prop-derived rootIdSet never does.
    const expandedRootsRef = useRef(new Set<EntityId>());
    // Freshly-fetched expansion nodes + links (NOT in the prop `entities`) + the type maps their
    // card resolves against. The root map is a nested per-type-chain structure, so we keep each
    // node's source map rather than deep-merging maps from every expansion.
    const expandedByIdRef = useRef(new Map<EntityId, EntityCardContext>());

    // The selected entity, pinned with a card (Open button) that tracks its on-screen
    // position. The Scene re-emits this through settle + pan/zoom.
    const [selection, setSelection] = useState<{
      readonly entityId: EntityId;
      readonly x: number;
      readonly y: number;
    } | null>(null);

    const entityById = useMemo(() => {
      const map = new Map<EntityId, HashEntity>();
      for (const entity of entities ?? []) {
        map.set(entity.metadata.recordId.entityId, entity);
      }
      return map;
    }, [entities]);

    // Each entity's incident-link count (degree): a link entity carries both endpoints, so one pass
    // over the links tallies both sides. Counts the prop links AND the links pulled in by frontier
    // expansion (held in `expandedByIdRef`) -- the union the worker itself ingested -- so a hub
    // enlarged by expansion reports its true loaded degree, not just its prop-visible links.
    // `frontierVersion` bumps after each expansion to recompute.
    const degreeById = useMemo(() => {
      // The recompute trigger after an expansion mutates the (ref-held) expanded set.
      void frontierVersion;
      const map = new Map<EntityId, number>();
      const tally = (entity: HashEntity): void => {
        const { linkData } = entity;
        if (!linkData) {
          return;
        }
        map.set(
          linkData.leftEntityId,
          (map.get(linkData.leftEntityId) ?? 0) + 1,
        );
        map.set(
          linkData.rightEntityId,
          (map.get(linkData.rightEntityId) ?? 0) + 1,
        );
      };
      for (const entity of entities ?? []) {
        tally(entity);
      }
      for (const context of expandedByIdRef.current.values()) {
        tally(context.entity);
      }
      return map;
    }, [entities, frontierVersion]);

    // Resolve a dot's entity to its display label (its name, e.g. "Alice"), the SAME way the hover
    // card does -- resolving from the prop set OR a frontier expansion. WHICH dots are hubs (and so
    // get an always-on label) is decided by the Scene from the worker's by-degree radius, not here;
    // this just names whatever it is asked about. The Scene calls it only when it rebuilds the label
    // set (zoom / structure change), never per frame. Undefined on any miss (entity not held, or its
    // closed type can't be resolved) so the dot simply goes unlabelled.
    const resolveEntityLabel = useCallback(
      (entityId: EntityId): string | undefined => {
        const propEntity = entityById.get(entityId);
        const context = propEntity
          ? { entity: propEntity, rootMap: closedMultiEntityTypesRootMap }
          : expandedByIdRef.current.get(entityId);
        if (!context?.entity || !context.rootMap) {
          return undefined;
        }
        try {
          const closedType = getClosedMultiEntityTypeFromMap(
            context.rootMap,
            context.entity.metadata.entityTypeIds,
          );
          return generateEntityLabel(closedType, context.entity);
        } catch {
          return undefined;
        }
      },
      [entityById, closedMultiEntityTypesRootMap],
    );

    // Resolve a dot's entity to its TYPE ICON as an atlas key -- the same display field the hover
    // card's icon uses (`getDisplayFieldsForClosedEntityType(...).icon`, which walks the type
    // hierarchy). The Scene calls this only when it rebuilds the flat-tier icon set (a structure
    // change), never per frame. Returns the key only when it's a non-empty STRING (an emoji or an
    // image URL); a ReactElement icon (system-type override) or none -> null -> no atlas entry,
    // so that dot simply shows no icon. NOT gated on hubs: the IconLayer's soft-LOD sizing hides
    // icons on dots that are small on screen, so every entity is eligible.
    // Icon resolution walks the type hierarchy; memo by type-set key so
    // each distinct set resolves once. Cache resets when the root map changes.
    const iconByTypeKey = useMemo(() => {
      void closedMultiEntityTypesRootMap;
      return new Map<string, string | null>();
    }, [closedMultiEntityTypesRootMap]);
    const resolveEntityIcon = useCallback(
      (entityId: EntityId): string | null => {
        // Same two-source lookup as resolveEntityLabel: prop entities resolve against the prop
        // root map, frontier-expanded entities against the map their expansion arrived with.
        const propEntity = entityById.get(entityId);
        const context = propEntity
          ? { entity: propEntity, rootMap: closedMultiEntityTypesRootMap }
          : expandedByIdRef.current.get(entityId);
        if (!context?.entity || !context.rootMap) {
          return null;
        }
        const typeKey = [...context.entity.metadata.entityTypeIds]
          .sort()
          .join("\u0000");
        const cached = iconByTypeKey.get(typeKey);
        if (cached !== undefined) {
          return cached;
        }
        let resolved: string | null;
        try {
          const closedType = getClosedMultiEntityTypeFromMap(
            context.rootMap,
            context.entity.metadata.entityTypeIds,
          );
          const { icon } = getDisplayFieldsForClosedEntityType(closedType);
          resolved = typeof icon === "string" && icon.length > 0 ? icon : null;
        } catch {
          resolved = null;
        }
        iconByTypeKey.set(typeKey, resolved);
        return resolved;
      },
      [entityById, closedMultiEntityTypesRootMap, iconByTypeKey],
    );

    // Reset when the worker is torn down (ready goes false→true on first build OR a sourceKey
    // recreate): the fresh worker holds nothing, so every local mirror of its state clears too.
    useEffect(() => {
      if (!ready) {
        workerGenerationRef.current += 1;
        sentCountRef.current = 0;
        expandedRootsRef.current.clear();
        expandedByIdRef.current.clear();
        inFlightFrontierRef.current.clear();
        setFrontierVersion((version) => version + 1);
        setFrontierError(undefined);
        setFrontierProgress({ done: 0, total: 0, fetching: false });
      }
    }, [ready]);

    useEffect(() => {
      if (!handle || !ready || !entities?.length || typeSchemas.length === 0) {
        return;
      }

      // `entities` only grows within one source (a source change recreates the worker and resets
      // the count), so stream just the new tail.
      const alreadySent = sentCountRef.current;
      if (alreadySent >= entities.length) {
        return;
      }

      const delta = entities.slice(alreadySent);
      sentCountRef.current = entities.length;
      handle.ingestBatch(toIngestEntities(delta, rootIdSet));
    }, [handle, ready, entities, typeSchemas, rootIdSet]);

    // Clicking a frontier node (fetched, non-root) expands its neighbourhood: fetch it and hand it
    // to the worker, whose additive ingest is the merge -- the clicked node flips to a root and
    // un-greys; its endpoints become the next frontier. Each id expands at most once.
    const expandFrontier = useCallback(
      async (entityIds: readonly EntityId[]) => {
        if (!handle) {
          return;
        }
        // A worker reset (sourceKey change) while a fetch is in flight makes this run stale: its
        // handle is disposed and its results describe the previous source. Every continuation
        // after an await re-checks before touching the worker or the local mirrors.
        const generation = workerGenerationRef.current;
        const isStale = () => workerGenerationRef.current !== generation;

        const fresh = freshFrontierIds(
          entityIds,
          expandedRootsRef.current,
          inFlightFrontierRef.current,
        );
        if (fresh.length === 0) {
          return;
        }

        for (const entityId of fresh) {
          inFlightFrontierRef.current.add(entityId);
        }
        setFrontierError(undefined);
        setFrontierProgress({ done: 0, total: fresh.length, fetching: true });

        let done = 0;
        try {
          for (const batch of frontierExpansionBatches(fresh)) {
            const expansion = await fetchFrontierExpansion(batch);
            if (isStale()) {
              return;
            }
            if (!expansion) {
              throw new Error("Frontier expansion returned no data.");
            }
            handle.registerTypes(
              extractTypeSchemas(
                expansion.entities,
                expansion.closedMultiEntityTypes,
                expansion.definitions,
              ),
              extractPropertySchemas(expansion.definitions),
            );
            handle.ingestBatch(
              toIngestEntities(expansion.entities, new Set(batch)),
            );
            for (const entityId of batch) {
              expandedRootsRef.current.add(entityId);
            }
            // Keep the fetched entities + the maps their card resolves against, for hover/selection
            // on nodes this expansion revealed (they are not in the prop `entities`).
            for (const entity of expansion.entities) {
              expandedByIdRef.current.set(entity.metadata.recordId.entityId, {
                entity,
                rootMap: expansion.closedMultiEntityTypes,
                definitions: expansion.definitions,
              });
            }
            done += batch.length;
            setFrontierProgress({
              done,
              total: fresh.length,
              fetching: done < fresh.length,
            });
          }
        } catch (fetchError) {
          if (!isStale()) {
            setFrontierError(
              fetchError instanceof Error
                ? fetchError.message
                : "Could not fetch the frontier.",
            );
          }
        } finally {
          // After a reset the fresh generation owns these refs and the progress UI; a stale run
          // must not delete in-flight markers the new generation may have re-added.
          if (!isStale()) {
            for (const entityId of fresh) {
              inFlightFrontierRef.current.delete(entityId);
            }
            setFrontierProgress((progress) => ({
              ...progress,
              fetching: false,
            }));
            setFrontierVersion((version) => version + 1);
          }
        }
      },
      [handle],
    );

    // The not-yet-expanded frontier across both entity sources (props + prior expansions).
    // Reads ref-held sets the render can't observe changing directly; `frontierVersion`
    // bumps after each expansion mutates them, which is what re-runs this memo.
    const frontierEntityIds = useMemo(() => {
      void frontierVersion;
      if (!rootIdSet) {
        return [];
      }
      const frontier = new Set<EntityId>();
      const addIfFrontier = (entity: HashEntity) => {
        const entityId = entity.metadata.recordId.entityId;
        if (
          !entity.linkData &&
          !rootIdSet.has(entityId) &&
          !expandedRootsRef.current.has(entityId) &&
          !inFlightFrontierRef.current.has(entityId)
        ) {
          frontier.add(entityId);
        }
      };
      for (const entity of entities ?? []) {
        addIfFrontier(entity);
      }
      for (const context of expandedByIdRef.current.values()) {
        addIfFrontier(context.entity);
      }
      return [...frontier];
    }, [frontierVersion, rootIdSet, entities]);

    const fetchCompleteFrontier = useCallback(() => {
      void expandFrontier(frontierEntityIds);
    }, [expandFrontier, frontierEntityIds]);

    const handleClusterHover = useCallback((next: ClusterHover | null) => {
      if (next) {
        if (clusterCloseTimerRef.current !== null) {
          clearTimeout(clusterCloseTimerRef.current);
          clusterCloseTimerRef.current = null;
        }
        clusterFrontierIdsRef.current = next.frontierEntityIds;
        setClusterHover(next);
        return;
      }
      // The cursor left the bubble; keep the card briefly so it can reach the button. The card's
      // own onMouseEnter cancels this; its onMouseLeave closes immediately.
      if (
        clusterCardHoveredRef.current ||
        clusterCloseTimerRef.current !== null
      ) {
        return;
      }
      clusterCloseTimerRef.current = setTimeout(() => {
        clusterCloseTimerRef.current = null;
        if (!clusterCardHoveredRef.current) {
          setClusterHover(null);
        }
      }, 140);
    }, []);

    const handleClusterCardEnter = useCallback(() => {
      clusterCardHoveredRef.current = true;
      if (clusterCloseTimerRef.current !== null) {
        clearTimeout(clusterCloseTimerRef.current);
        clusterCloseTimerRef.current = null;
      }
    }, []);

    const handleClusterCardLeave = useCallback(() => {
      clusterCardHoveredRef.current = false;
      setClusterHover(null);
    }, []);

    // Load a wholly-frontier cluster: expand every frontier entity it holds (read from the ref so
    // this stays stable across the per-frame card re-position). expandFrontier dedupes, so a second
    // Load of an in-flight cluster is a no-op. Dismiss the card; the loaded bubble un-greys.
    const handleLoadCluster = useCallback(() => {
      void expandFrontier(clusterFrontierIdsRef.current);
      clusterCardHoveredRef.current = false;
      setClusterHover(null);
    }, [expandFrontier]);

    useEffect(
      () => () => {
        if (clusterCloseTimerRef.current !== null) {
          clearTimeout(clusterCloseTimerRef.current);
        }
      },
      [],
    );

    const handleEntitySelect = useCallback(
      (next: EntitySelection | null) => {
        setSelection(next);
        // A frontier node also expands its neighbourhood -- once (see expandedRootsRef).
        if (
          next &&
          rootIdSet &&
          !rootIdSet.has(next.entityId) &&
          !expandedRootsRef.current.has(next.entityId)
        ) {
          void expandFrontier([next.entityId]);
        }
      },
      [rootIdSet, expandFrontier],
    );

    // Stable Open handler: the selection card's screen position updates every pan frame, so its
    // content + callbacks must stay referentially stable or the memoized body re-renders too.
    const selectedEntityId = selection?.entityId;
    const handleOpenSelected = useCallback(() => {
      if (selectedEntityId !== undefined) {
        onEntityClick?.(selectedEntityId);
      }
    }, [onEntityClick, selectedEntityId]);

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

    // The card data for an entity: the prop maps for an entity in `entities`, else the expansion
    // it arrived in (a node a frontier expand revealed is not in the prop `entities`).
    const cardContext = (entityId: EntityId): EntityCardContext | undefined => {
      const propEntity = entityById.get(entityId);
      if (propEntity) {
        return {
          entity: propEntity,
          rootMap: closedMultiEntityTypesRootMap,
          definitions,
        };
      }
      return expandedByIdRef.current.get(entityId);
    };

    // While a node is pinned (selected), suppress its transient hover card so they don't
    // stack on the same dot.
    const hoveredCtx =
      hover !== null && hover.entityId !== selection?.entityId
        ? cardContext(hover.entityId)
        : undefined;
    const selectedCtx =
      selection !== null ? cardContext(selection.entityId) : undefined;

    return (
      <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
        <GraphVisualizerV2
          handle={handle}
          loadingComponent={
            <GraphStatusOverlay
              title="Fetching connected entities"
              description="Existing graph content stays visible while new data loads."
            />
          }
          onEntityHover={setHover}
          onHighwayHover={setHighwayHover}
          onEntitySelect={handleEntitySelect}
          onClusterHover={handleClusterHover}
          onOpenLinkTable={onOpenLinkTable}
          resolveEntityLabel={resolveEntityLabel}
          resolveEntityIcon={resolveEntityIcon}
          onEntityLabels={setEntityLabels}
          onSceneReady={onSceneReady}
        />
        <FrontierControls
          frontierCount={frontierEntityIds.length}
          isFetching={frontierProgress.fetching}
          fetchedCount={frontierProgress.done}
          totalToFetch={frontierProgress.total}
          error={frontierError}
          onFetchCompleteFrontier={fetchCompleteFrontier}
        />
        {shouldShowGuidance ? (
          <GraphGuidanceCard onDismiss={dismissGuidance} />
        ) : (
          <FrontierLegend />
        )}
        <EntityLabelOverlay labels={entityLabels} />
        {hover !== null && hoveredCtx !== undefined ? (
          <EntityHoverCard
            entity={hoveredCtx.entity}
            closedMultiEntityTypesRootMap={hoveredCtx.rootMap}
            definitions={hoveredCtx.definitions}
            degree={degreeById.get(hover.entityId) ?? 0}
            x={hover.x}
            y={hover.y}
          />
        ) : null}
        {highwayHover !== null ? (
          <HighwaySummaryCard
            typeId={highwayHover.typeId}
            typeLabel={highwayHover.typeLabel}
            count={highwayHover.count}
            direction={highwayHover.direction}
            closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
            x={highwayHover.x}
            y={highwayHover.y}
          />
        ) : null}
        {clusterHover !== null ? (
          <FrontierClusterCard
            count={clusterHover.count}
            x={clusterHover.x}
            y={clusterHover.y}
            radiusPx={clusterHover.radiusPx}
            isFetching={frontierProgress.fetching}
            onLoad={handleLoadCluster}
            onMouseEnter={handleClusterCardEnter}
            onMouseLeave={handleClusterCardLeave}
          />
        ) : null}
        {selection !== null && selectedCtx !== undefined ? (
          <EntityHoverCard
            entity={selectedCtx.entity}
            closedMultiEntityTypesRootMap={selectedCtx.rootMap}
            definitions={selectedCtx.definitions}
            degree={degreeById.get(selection.entityId) ?? 0}
            x={selection.x}
            y={selection.y}
            onOpen={onEntityClick ? handleOpenSelected : undefined}
          />
        ) : null}
      </Box>
    );
  },
);
