/**
 * Edge aggregation: classifies stored links under the current LOD cut
 * into aggregate (between clusters), individual (between visible entities),
 * or hidden (internal to collapsed clusters).
 *
 * The rendered edge set is the quotient multigraph of stored links under
 * the visible-owner equivalence relation induced by the LOD cut.
 *
 * Invariants:
 *   1. Every stored link is classified as exactly one of
 *      aggregate / individual / hidden (no double counting).
 *   2. For every aggregate edge (A, B, type), its count equals
 *      the number of links whose endpoint visible owners are A and B
 *      with that TypeSetIdx.
 *   3. Visual keys are based on semantic identity (cluster pair + type),
 *      not array order.
 *   4. Even when rendering a collapsed edge, exact byType counts are kept.
 *   5. Aggregates are additive: affected links can be subtracted and
 *      re-added exactly for incremental updates.
 */
import { PairKey, VisualEdgeKey } from "../../ids";
import { graphColors } from "../../visual-style";
import { edgeColorForType, primaryTypeOfSet } from "../entity-style";

import type { VizConfig } from "../../config";
import type { Color } from "../../frames";
import type { ClusterId, EntityIndex, TypeSetId } from "../../ids";
import type { ClusterNode, ClusterTree } from "../hierarchy/cluster-tree";
import type { LodItem } from "../hierarchy/lod";
import type { LinkStore } from "../store/link";
import type { TypeRegistry } from "../store/type-registry";
import type { TypeSetGroup, TypeSetStore } from "../store/type-set";
import type { VersionedUrl } from "@blockprotocol/type-system";

// Color / width / label helpers

export function widthForCount(count: number): number {
  return Math.max(1, Math.min(8, 1 + Math.log2(count + 1)));
}

export function typeLabelForGroup(
  group: TypeSetGroup | undefined,
  types: TypeRegistry,
): string {
  if (!group) {
    return "Unknown";
  }

  const titles: string[] = [];
  for (const typeIdx of group.directTypeIds) {
    const info = types.get(typeIdx);
    if (info) {
      titles.push(info.title);
    }
  }

  return titles.length > 0 ? titles.join(" \u00d7 ") : "Unknown";
}

/**
 * The single link type's VersionedUrl for a type-set group, or `null` if the group covers more
 * than one type (a rollup). A lane is single-type by definition, so its group has one direct type;
 * shipping its URL lets the main thread resolve the icon/title from the closed type schema it
 * already holds, without the worker shipping any rich type data.
 */
export function typeUrlForGroup(
  group: TypeSetGroup | undefined,
  types: TypeRegistry,
): VersionedUrl | null {
  if (!group) {
    return null;
  }
  let only: VersionedUrl | null = null;
  let seen = 0;
  for (const typeIdx of group.directTypeIds) {
    const url = types.getUrl(typeIdx);
    if (url === undefined) {
      continue;
    }
    seen += 1;
    if (seen > 1) {
      return null;
    }
    only = url;
  }
  return only;
}

/**
 * The reverse (target -> source) label for a type-set group: each type's inverse title ("Member
 * Of") in place of its forward title ("Has Member"), so a reverse lane reads correctly. Falls back
 * to the forward title for a type with no inverse.
 */
export function inverseLabelForGroup(
  group: TypeSetGroup | undefined,
  types: TypeRegistry,
): string {
  if (!group) {
    return "Unknown";
  }

  const titles: string[] = [];
  for (const typeIdx of group.directTypeIds) {
    const info = types.get(typeIdx);
    if (info) {
      titles.push(info.inverseTitle ?? info.title);
    }
  }

  return titles.length > 0 ? titles.join(" × ") : "Unknown";
}

// Cut index

function collectEntityOwnership(
  node: ClusterNode,
  typeSets: TypeSetStore,
  ownerId: ClusterId,
  result: Map<number, ClusterId>,
): void {
  if (node.membership.source === "direct") {
    for (const idx of node.membership.members.subarray()) {
      result.set(idx as number, ownerId);
    }
  } else {
    for (const key of node.membership.keys) {
      const group = typeSets.get(key);
      if (group) {
        for (const idx of group.entities) {
          result.set(idx as number, ownerId);
        }
      }
    }
  }

  // Rollup/family nodes carry no direct membership of their own.
  // When collapsed into a single block, they must still own all
  // entities in their subtree, otherwise those links are dropped.
  for (const child of node.children) {
    collectEntityOwnership(child, typeSets, ownerId, result);
  }
}

/**
 * Maps every entity to its owning cluster at the current LOD level.
 *
 * Built from all clusters in the tree (not viewport-filtered).
 * The viewport LOD cut determines which clusters are "open" (showing
 * children or entities). Off-screen clusters default to "cluster" mode.
 * Frustum culling is left to the presentation layer (Deck.gl).
 */
export class CutIndex {
  readonly #entityModeIds: ReadonlySet<ClusterId>;
  readonly #containerIds: ReadonlySet<ClusterId>;
  readonly #entityOwner: ReadonlyMap<number, ClusterId>;

  constructor(
    viewportCut: readonly LodItem[],
    clusterTree: ClusterTree,
    typeSets: TypeSetStore,
  ) {
    const blockIds = new Set<ClusterId>();
    const entityModeIds = new Set<ClusterId>();
    const containerIds = new Set<ClusterId>();
    const entityOwner = new Map<number, ClusterId>();

    // Index viewport cut by cluster ID for mode lookup.
    const cutModes = new Map<ClusterId, LodItem["mode"]>();
    for (const item of viewportCut) {
      cutModes.set(item.clusterId, item.mode);
    }

    // Walk all clusters in the tree, using viewport cut modes
    // where available, defaulting to "cluster" for off-screen nodes.
    this.#walkTree(
      clusterTree.root,
      cutModes,
      typeSets,
      blockIds,
      entityModeIds,
      containerIds,
      entityOwner,
    );

    this.#entityModeIds = entityModeIds;
    this.#containerIds = containerIds;
    this.#entityOwner = entityOwner;
  }

  /** Clusters in "children" mode (showing sub-clusters). */
  get containerIds(): ReadonlySet<ClusterId> {
    return this.#containerIds;
  }

  /**
   * Recursively walk the cluster tree. "children" mode means
   * the node is a container: recurse into children. Any other mode
   * (or absent from cut) means this node is a block that owns
   * all its entities.
   */
  #walkTree(
    node: ClusterNode,
    cutModes: ReadonlyMap<ClusterId, LodItem["mode"]>,
    typeSets: TypeSetStore,
    blockIds: Set<ClusterId>,
    entityModeIds: Set<ClusterId>,
    containerIds: Set<ClusterId>,
    entityOwner: Map<number, ClusterId>,
  ): void {
    if (node.kind === "root") {
      for (const child of node.children) {
        this.#walkTree(
          child,
          cutModes,
          typeSets,
          blockIds,
          entityModeIds,
          containerIds,
          entityOwner,
        );
      }
      return;
    }

    const mode = cutModes.get(node.id);

    // "children" mode: this node is a container.
    if (mode === "children" && node.children.length > 0) {
      containerIds.add(node.id);
      for (const child of node.children) {
        this.#walkTree(
          child,
          cutModes,
          typeSets,
          blockIds,
          entityModeIds,
          containerIds,
          entityOwner,
        );
      }
      return;
    }

    // Block: this node owns all its entities.
    blockIds.add(node.id);

    if (mode === "entities" || mode === "entities-pending") {
      entityModeIds.add(node.id);
    }

    collectEntityOwnership(node, typeSets, node.id, entityOwner);
  }

  get size(): number {
    return this.#entityOwner.size;
  }

  ownerOf(entityIdx: number): ClusterId | undefined {
    return this.#entityOwner.get(entityIdx);
  }

  isEntityMode(clusterId: ClusterId): boolean {
    return this.#entityModeIds.has(clusterId);
  }

  get entityModeIds(): ReadonlySet<ClusterId> {
    return this.#entityModeIds;
  }

  /** Iterate all (entityIdx, ownerId) pairs for incremental diffing. */
  *entries(): IterableIterator<[number, ClusterId]> {
    yield* this.#entityOwner;
  }
}

// Pair key

const SEP = "\u001f";

export function makePairKey(
  a: ClusterId,
  b: ClusterId,
): {
  readonly key: PairKey;
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
} {
  if (a > b) {
    return { key: PairKey(`${b}${SEP}${a}`), sourceId: b, targetId: a };
  }
  return { key: PairKey(`${a}${SEP}${b}`), sourceId: a, targetId: b };
}

// Internal mutable aggregation types

interface TypeAggregation {
  readonly typeSetId: TypeSetId;
  /**
   * Links flowing from the lower-sorted cluster ID to the higher one,
   * matching PairKey's sort order.
   */
  forwardCount: number;
  /** Links flowing in the opposite direction. */
  reverseCount: number;
  /**
   * The link entities counted in `forwardCount`. Maintained in lockstep with
   * the count (added on +1, removed on -1), so a clicked highway lane can
   * resolve, on demand, to the exact set of links it aggregates.
   */
  readonly forwardLinks: Set<EntityIndex>;
  /** The link entities counted in `reverseCount` (mirror of `forwardLinks`). */
  readonly reverseLinks: Set<EntityIndex>;
}

interface MutablePairAggregation {
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
  readonly byType: Map<number, TypeAggregation>;
  totalCount: number;
}

interface StoredIndividualEdge {
  readonly linkId: number;
  readonly ownerClusterId: ClusterId;
  readonly leftEntityIdx: number;
  readonly rightEntityIdx: number;
  readonly typeSetId: TypeSetId;
}

// Visual edge types (spec 6.2)

interface ClusterEndpointRef {
  readonly kind: "cluster";
  readonly id: ClusterId;
}

interface EntityEndpointRef {
  readonly kind: "entity";
  readonly entityIdx: number;
  readonly ownerClusterId: ClusterId;
}

/**
 * Direction of an aggregate lane relative to PairKey's sort order.
 * "forward" = links from the lower-sorted cluster to the higher one,
 * "reverse" = the opposite, "both" = a collapsed lane mixing directions.
 */
export type EdgeDirection = "forward" | "reverse" | "both";

export interface AggregatedVisualEdge {
  readonly kind: "aggregate";
  readonly visualKey: VisualEdgeKey;
  readonly source: ClusterEndpointRef;
  readonly target: ClusterEndpointRef;
  readonly pairKey: PairKey;
  readonly typeSetId: TypeSetId | undefined;
  /**
   * The lane's single link type as a VersionedUrl, when it has exactly one (a lane is single-type
   * by definition). `null` for a multi-type rollup (`collapsed`). The main thread resolves the
   * type's icon + title from the closed type schema it already holds -- the worker ships only the
   * identity, never rich type data (INTERACTION.md: worker computes, main thread presents).
   */
  readonly typeId: VersionedUrl | null;
  readonly direction: EdgeDirection;
  readonly collapsed: boolean;
  readonly count: number;
  readonly totalPairCount: number;
  readonly distinctTypeCount: number;
  readonly color: Color;
  readonly widthWorld: number;
  readonly typeLabel: string;
  /**
   * Stable per-commit id of this lane: its index in the final
   * `EdgeFrame.visualEdges` array. Carried out to the rendered bezier segments
   * (their `id`) so a clicked highway segment maps back to this lane, and used
   * to index `StructureFrame.highwayLanes`.
   */
  readonly laneId: number;
  /**
   * The link entities this lane aggregates. A forward lane carries the
   * forward links, a reverse lane the reverse, a collapsed/"both" lane the
   * union of both. Lets a clicked highway resolve to its underlying links.
   */
  readonly linkEntityIdxs: readonly EntityIndex[];
}

export interface IndividualVisualEdge {
  readonly kind: "individual";
  readonly visualKey: VisualEdgeKey;
  readonly source: EntityEndpointRef;
  readonly target: EntityEndpointRef;
  readonly linkId: number;
  readonly typeSetId: TypeSetId;
  readonly count: 1;
  readonly color: Color;
  readonly widthWorld: number;
  readonly typeLabel: string;
}

export type VisualEdge = AggregatedVisualEdge | IndividualVisualEdge;

export interface EdgeFrame {
  readonly visualEdges: readonly VisualEdge[];
  readonly exactLogicalEdgeCount: number;
  readonly renderedLogicalEdgeCount: number;
  readonly omittedLogicalEdgeCount: number;
  readonly truncated: boolean;
}

// Pair explosion: convert raw aggregation into visual edges

function explodePair(
  pairKey: PairKey,
  pair: MutablePairAggregation,
  typeSets: TypeSetStore,
  types: TypeRegistry,
  config: VizConfig,
): AggregatedVisualEdge[] {
  const typeAggs = [...pair.byType.values()].sort(
    (a, b) =>
      b.forwardCount + b.reverseCount - (a.forwardCount + a.reverseCount) ||
      (a.typeSetId as number) - (b.typeSetId as number),
  );

  const source: ClusterEndpointRef = { kind: "cluster", id: pair.sourceId };
  const target: ClusterEndpointRef = { kind: "cluster", id: pair.targetId };

  if (typeAggs.length > config.maxParallelEdgeTypes) {
    // A collapsed/"both" lane carries the union of both directions' links.
    const collapsedLinks: EntityIndex[] = [];
    for (const agg of typeAggs) {
      collapsedLinks.push(...agg.forwardLinks, ...agg.reverseLinks);
    }
    return [
      {
        kind: "aggregate",
        visualKey: VisualEdgeKey(`agg:${pairKey}:__collapsed__`),
        source,
        target,
        pairKey,
        typeSetId: undefined,
        typeId: null,
        direction: "both",
        collapsed: true,
        count: pair.totalCount,
        totalPairCount: pair.totalCount,
        distinctTypeCount: typeAggs.length,
        color: [...graphColors.collapsedEdge],
        widthWorld: widthForCount(pair.totalCount),
        typeLabel: `${typeAggs.length} link types`,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        linkEntityIdxs: collapsedLinks,
      },
    ];
  }

  // A type with links in both directions becomes two separate lanes
  // (one per direction), each sized by its own count.
  const edges: AggregatedVisualEdge[] = [];
  for (const agg of typeAggs) {
    const group = typeSets.getById(agg.typeSetId);
    const typeLabel = typeLabelForGroup(group, types);
    const inverseLabel = inverseLabelForGroup(group, types);
    const typeId = typeUrlForGroup(group, types);
    const color = edgeColorForType(
      group ? primaryTypeOfSet(group.directTypeIds, types) : undefined,
      types,
    );

    if (agg.forwardCount > 0) {
      edges.push({
        kind: "aggregate",
        visualKey: VisualEdgeKey(
          `agg:${pairKey}:${agg.typeSetId as number}:forward`,
        ),
        source,
        target,
        pairKey,
        typeSetId: agg.typeSetId,
        typeId,
        direction: "forward",
        collapsed: false,
        count: agg.forwardCount,
        totalPairCount: pair.totalCount,
        distinctTypeCount: typeAggs.length,
        color,
        widthWorld: widthForCount(agg.forwardCount),
        typeLabel,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        linkEntityIdxs: Array.from(agg.forwardLinks),
      });
    }

    if (agg.reverseCount > 0) {
      edges.push({
        kind: "aggregate",
        visualKey: VisualEdgeKey(
          `agg:${pairKey}:${agg.typeSetId as number}:reverse`,
        ),
        source,
        target,
        pairKey,
        typeSetId: agg.typeSetId,
        typeId,
        direction: "reverse",
        collapsed: false,
        count: agg.reverseCount,
        totalPairCount: pair.totalCount,
        distinctTypeCount: typeAggs.length,
        color,
        widthWorld: widthForCount(agg.reverseCount),
        typeLabel: inverseLabel,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        linkEntityIdxs: Array.from(agg.reverseLinks),
      });
    }
  }

  return edges;
}

// Edge aggregator

/**
 * Maintains edge aggregation state across frames. Supports
 * incremental updates: when the LOD cut changes, only links
 * whose visible owner changed are reclassified.
 *
 * Falls back to full recomputation when >35% of entities
 * changed owners, or on first run / after reset.
 */
export class EdgeAggregator {
  readonly #pairs = new Map<string, MutablePairAggregation>();
  readonly #individuals = new Map<number, StoredIndividualEdge>();
  #hiddenCount = 0;
  #previousCutIndex: CutIndex | undefined;

  reset(): void {
    this.#pairs.clear();
    this.#individuals.clear();
    this.#hiddenCount = 0;
    this.#previousCutIndex = undefined;
  }

  /**
   * Update aggregation for a new LOD cut. Uses incremental
   * reclassification when possible, full recomputation otherwise.
   */
  update(
    cutIndex: CutIndex,
    linkStore: LinkStore,
    typeSets: TypeSetStore,
    types: TypeRegistry,
    config: VizConfig,
  ): EdgeFrame {
    if (!this.#previousCutIndex) {
      this.#fullRecompute(cutIndex, linkStore);
    } else {
      const changedEntities = this.#findChangedEntities(cutIndex);
      const changeRatio = changedEntities.size / Math.max(1, cutIndex.size);

      if (changeRatio > 0.35) {
        this.#fullRecompute(cutIndex, linkStore);
      } else if (changedEntities.size > 0) {
        this.#incrementalUpdate(changedEntities, cutIndex, linkStore);
      }
    }

    this.#previousCutIndex = cutIndex;
    return this.#buildFrame(typeSets, types, config);
  }

  // Accessors for edge-geometry fan-out

  get pairs(): ReadonlyMap<string, MutablePairAggregation> {
    return this.#pairs;
  }

  /**
   * Classify a link and apply its contribution (sign = +1)
   * or undo it (sign = -1).
   */
  #applyLink(
    linkId: number,
    leftIdx: number,
    rightIdx: number,
    typeSetId: TypeSetId,
    linkEntityIdx: EntityIndex,
    cutIndex: CutIndex,
    sign: 1 | -1,
  ): void {
    if (leftIdx === -1 || rightIdx === -1) {
      this.#hiddenCount += sign;
      return;
    }

    const leftOwner = cutIndex.ownerOf(leftIdx);
    const rightOwner = cutIndex.ownerOf(rightIdx);

    if (!leftOwner || !rightOwner) {
      this.#hiddenCount += sign;
      return;
    }

    // Same visible owner: individual (if entity mode) or hidden.
    if (leftOwner === rightOwner) {
      if (cutIndex.isEntityMode(leftOwner)) {
        if (sign === 1) {
          this.#individuals.set(linkId, {
            linkId,
            ownerClusterId: leftOwner,
            leftEntityIdx: leftIdx,
            rightEntityIdx: rightIdx,
            typeSetId,
          });
        } else {
          this.#individuals.delete(linkId);
        }
      } else {
        this.#hiddenCount += sign;
      }
      return;
    }

    // Different visible owners: aggregate.
    const { key, sourceId, targetId } = makePairKey(leftOwner, rightOwner);

    // The link flows from leftOwner (source) to rightOwner (target).
    // "forward" means that flow matches the PairKey sort order, i.e.
    // the link's source owner is the lower-sorted cluster.
    const forward = leftOwner === sourceId;

    if (sign === 1) {
      let pair = this.#pairs.get(key);
      if (!pair) {
        pair = { sourceId, targetId, byType: new Map(), totalCount: 0 };
        this.#pairs.set(key, pair);
      }

      let typeAgg = pair.byType.get(typeSetId as number);
      if (!typeAgg) {
        typeAgg = {
          typeSetId,
          forwardCount: 0,
          reverseCount: 0,
          forwardLinks: new Set(),
          reverseLinks: new Set(),
        };
        pair.byType.set(typeSetId as number, typeAgg);
      }
      if (forward) {
        typeAgg.forwardCount++;
        typeAgg.forwardLinks.add(linkEntityIdx);
      } else {
        typeAgg.reverseCount++;
        typeAgg.reverseLinks.add(linkEntityIdx);
      }
      pair.totalCount++;
    } else {
      const pair = this.#pairs.get(key);
      if (pair) {
        const typeAgg = pair.byType.get(typeSetId as number);
        if (typeAgg) {
          if (forward) {
            typeAgg.forwardCount--;
            typeAgg.forwardLinks.delete(linkEntityIdx);
          } else {
            typeAgg.reverseCount--;
            typeAgg.reverseLinks.delete(linkEntityIdx);
          }
          if (typeAgg.forwardCount <= 0 && typeAgg.reverseCount <= 0) {
            pair.byType.delete(typeSetId as number);
          }
        }
        pair.totalCount--;
        if (pair.totalCount <= 0) {
          this.#pairs.delete(key);
        }
      }
    }
  }

  #fullRecompute(cutIndex: CutIndex, linkStore: LinkStore): void {
    this.#pairs.clear();
    this.#individuals.clear();
    this.#hiddenCount = 0;

    for (let i = 0; i < linkStore.count; i++) {
      this.#applyLink(
        i,
        linkStore.getLeft(i) as number,
        linkStore.getRight(i) as number,
        linkStore.getTypeSetId(i),
        linkStore.getEntityIndex(i),
        cutIndex,
        1,
      );
    }
  }

  #incrementalUpdate(
    changedEntities: Set<number>,
    newCutIndex: CutIndex,
    linkStore: LinkStore,
  ): void {
    const oldCutIndex = this.#previousCutIndex!;
    const processedLinks = new Set<number>();

    for (const entityIdx of changedEntities) {
      const links = linkStore.linksFor(entityIdx as EntityIndex);
      for (const link of links) {
        if (processedLinks.has(link.linkId)) {
          continue;
        }
        processedLinks.add(link.linkId);

        const leftIdx = linkStore.getLeft(link.linkId) as number;
        const rightIdx = linkStore.getRight(link.linkId) as number;
        const typeSetId = linkStore.getTypeSetId(link.linkId);
        const linkEntityIdx = linkStore.getEntityIndex(link.linkId);

        // Undo old classification, apply new classification.
        this.#applyLink(
          link.linkId,
          leftIdx,
          rightIdx,
          typeSetId,
          linkEntityIdx,
          oldCutIndex,
          -1,
        );
        this.#applyLink(
          link.linkId,
          leftIdx,
          rightIdx,
          typeSetId,
          linkEntityIdx,
          newCutIndex,
          1,
        );
      }
    }
  }

  #findChangedEntities(newCutIndex: CutIndex): Set<number> {
    const changed = new Set<number>();
    const oldCutIndex = this.#previousCutIndex!;

    // Entities whose owner changed or who left the view.
    for (const [entityIdx, oldOwner] of oldCutIndex.entries()) {
      const newOwner = newCutIndex.ownerOf(entityIdx);
      if (newOwner !== oldOwner) {
        changed.add(entityIdx);
      } else if (
        // Owner unchanged, but the owner flipped between entity mode
        // and block mode (e.g. a leaf bubble zoomed open into "entities").
        // Internal links must move between `individual` and `hidden`.
        oldCutIndex.isEntityMode(oldOwner) !==
        newCutIndex.isEntityMode(oldOwner)
      ) {
        changed.add(entityIdx);
      }
    }

    // Entities that entered the view.
    for (const [entityIdx] of newCutIndex.entries()) {
      if (oldCutIndex.ownerOf(entityIdx) === undefined) {
        changed.add(entityIdx);
      }
    }

    return changed;
  }

  #buildFrame(
    typeSets: TypeSetStore,
    types: TypeRegistry,
    config: VizConfig,
  ): EdgeFrame {
    const visualEdges: VisualEdge[] = [];

    // Explode pairs into per-type (or collapsed) aggregate edges.
    for (const [pairKey, pair] of this.#pairs) {
      const exploded = explodePair(
        pairKey as PairKey,
        pair,
        typeSets,
        types,
        config,
      );
      visualEdges.push(...exploded);
    }

    // Individual edges.
    for (const edge of this.#individuals.values()) {
      const group = typeSets.getById(edge.typeSetId);
      visualEdges.push({
        kind: "individual",
        visualKey: VisualEdgeKey(`link:${edge.linkId}`),
        source: {
          kind: "entity",
          entityIdx: edge.leftEntityIdx,
          ownerClusterId: edge.ownerClusterId,
        },
        target: {
          kind: "entity",
          entityIdx: edge.rightEntityIdx,
          ownerClusterId: edge.ownerClusterId,
        },
        linkId: edge.linkId,
        typeSetId: edge.typeSetId,
        count: 1,
        color: edgeColorForType(
          group ? primaryTypeOfSet(group.directTypeIds, types) : undefined,
          types,
        ),
        widthWorld: 1,
        typeLabel: typeLabelForGroup(group, types),
      });
    }

    // Compute metadata.
    let aggregateTotal = 0;
    for (const pair of this.#pairs.values()) {
      aggregateTotal += pair.totalCount;
    }
    const exactLogicalEdgeCount =
      aggregateTotal + this.#individuals.size + this.#hiddenCount;

    // Edge cap: keep highest-count edges if over budget.
    const truncated = visualEdges.length > config.maxRenderedEdges;
    if (truncated) {
      visualEdges.sort((lhs, rhs) => rhs.count - lhs.count);
      visualEdges.length = config.maxRenderedEdges;
    }

    // The visualEdges order is now final. Stamp each aggregate lane with its
    // index as a stable per-commit `laneId`: carried out to the rendered bezier
    // segments and used to index `StructureFrame.highwayLanes`.
    for (let i = 0; i < visualEdges.length; i++) {
      const edge = visualEdges[i]!;
      if (edge.kind === "aggregate") {
        visualEdges[i] = { ...edge, laneId: i };
      }
    }

    const renderedLogicalEdgeCount = visualEdges.reduce(
      (sum, edge) => sum + edge.count,
      0,
    );

    return {
      visualEdges,
      exactLogicalEdgeCount,
      renderedLogicalEdgeCount,
      omittedLogicalEdgeCount: this.#hiddenCount,
      truncated,
    };
  }
}
