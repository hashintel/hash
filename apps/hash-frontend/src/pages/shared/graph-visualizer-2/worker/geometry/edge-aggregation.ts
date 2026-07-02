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
 *      with that TypeSetId.
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
import type { ClusterId, EntityIndex, LinkId, TypeSetId } from "../../ids";
import type { ClusterNode, ClusterTree } from "../hierarchy/cluster-tree";
import type { LodItem } from "../hierarchy/lod";
import type { LinkStore } from "../store/link";
import type { TypeRegistry } from "../store/type-registry";
import type { TypeSetGroup, TypeSetStore } from "../store/type-set";
import type { VersionedUrl } from "@blockprotocol/type-system";

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

  return titles.length > 0 ? titles.join(" × ") : "Unknown";
}

/**
 * The single link type's VersionedUrl for a type-set group, or `null` if the
 * group covers more than one type (a rollup). The main thread resolves the
 * type's icon and title from the closed type schema it already holds.
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
 * The reverse (target -> source) label for a type-set group. Each type's
 * inverse title ("Member Of") replaces its forward title ("Has Member");
 * falls back to the forward title for types with no inverse.
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

function collectEntityOwnership(
  node: ClusterNode,
  typeSets: TypeSetStore,
  ownerId: ClusterId,
  result: Map<number, ClusterId>,
): void {
  if (node.membership.source === "direct") {
    for (const idx of node.membership.members.subarray()) {
      result.set(idx, ownerId);
    }
  } else {
    for (const key of node.membership.keys) {
      const group = typeSets.get(key);
      if (group) {
        for (const idx of group.entities) {
          result.set(idx, ownerId);
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
 * Built from all clusters in the tree (not viewport-filtered);
 * off-screen clusters default to "cluster" mode. Frustum culling
 * is left to Deck.gl.
 */
export class CutIndex {
  readonly #entityModeIds: ReadonlySet<ClusterId>;
  readonly #containerIds: ReadonlySet<ClusterId>;
  readonly #entityOwner: ReadonlyMap<EntityIndex, ClusterId>;

  constructor(
    viewportCut: readonly LodItem[],
    clusterTree: ClusterTree,
    typeSets: TypeSetStore,
  ) {
    const blockIds = new Set<ClusterId>();
    const entityModeIds = new Set<ClusterId>();
    const containerIds = new Set<ClusterId>();
    const entityOwner = new Map<EntityIndex, ClusterId>();

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

  get containerIds(): ReadonlySet<ClusterId> {
    return this.#containerIds;
  }

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

  ownerOf(entityIdx: EntityIndex): ClusterId | undefined {
    return this.#entityOwner.get(entityIdx);
  }

  isEntityMode(clusterId: ClusterId): boolean {
    return this.#entityModeIds.has(clusterId);
  }

  get entityModeIds(): ReadonlySet<ClusterId> {
    return this.#entityModeIds;
  }

  *entries(): IterableIterator<[EntityIndex, ClusterId]> {
    yield* this.#entityOwner;
  }
}

/**
 * The cut surface {@link EdgeAggregator} classifies against: entity -> owner
 * lookups plus the entity-mode flag per owner. {@link CutIndex} satisfies it;
 * tests can substitute a hand-built cut without a cluster tree.
 */
export interface CutView {
  readonly size: number;
  ownerOf(entityIdx: EntityIndex): ClusterId | undefined;
  isEntityMode(clusterId: ClusterId): boolean;
  entries(): IterableIterator<[EntityIndex, ClusterId]>;
}

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

interface TypeAggregation {
  readonly typeSetId: TypeSetId;
  readonly forward: Set<EntityIndex>;
  readonly reverse: Set<EntityIndex>;
}

interface MutablePairAggregation {
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
  readonly byType: Map<TypeSetId, TypeAggregation>;
  totalCount: number;
}

interface StoredIndividualEdge {
  readonly linkId: LinkId;
  readonly ownerClusterId: ClusterId;
  readonly leftEntityIndex: EntityIndex;
  readonly rightEntityIndex: EntityIndex;
  readonly typeSetId: TypeSetId;
}

interface ClusterEndpointRef {
  readonly kind: "cluster";
  readonly id: ClusterId;
}

interface EntityEndpointRef {
  readonly kind: "entity";
  readonly entityIdx: EntityIndex;
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
  readonly entities: Set<EntityIndex>;
}

export interface IndividualVisualEdge {
  readonly kind: "individual";
  readonly visualKey: VisualEdgeKey;
  readonly source: EntityEndpointRef;
  readonly target: EntityEndpointRef;
  readonly linkId: LinkId;
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

function explodePair(
  pairKey: PairKey,
  pair: MutablePairAggregation,
  typeSets: TypeSetStore,
  types: TypeRegistry,
  config: VizConfig,
): AggregatedVisualEdge[] {
  const aggregations = [...pair.byType.values()].sort(
    (a, b) =>
      b.forward.size + b.reverse.size - (a.forward.size + a.reverse.size) ||
      a.typeSetId - b.typeSetId,
  );

  const source: ClusterEndpointRef = { kind: "cluster", id: pair.sourceId };
  const target: ClusterEndpointRef = { kind: "cluster", id: pair.targetId };

  if (aggregations.length > config.maxParallelEdgeTypes) {
    // A collapsed/"both" lane carries the union of both directions' links.
    // Built by accumulation: Set.union would allocate a fresh copy per step.
    const collapsedLinks = new Set<EntityIndex>();

    for (const aggregation of aggregations) {
      for (const linkEntityIdx of aggregation.forward) {
        collapsedLinks.add(linkEntityIdx);
      }
      for (const linkEntityIdx of aggregation.reverse) {
        collapsedLinks.add(linkEntityIdx);
      }
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
        distinctTypeCount: aggregations.length,
        color: graphColors.collapsedEdge,
        widthWorld: widthForCount(pair.totalCount),
        typeLabel: `${aggregations.length} link types`,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        entities: collapsedLinks,
      },
    ];
  }

  // A type with links in both directions becomes two separate lanes
  // (one per direction), each sized by its own count.
  const edges: AggregatedVisualEdge[] = [];

  for (const aggregate of aggregations) {
    const group = typeSets.getById(aggregate.typeSetId);

    const typeLabel = typeLabelForGroup(group, types);
    const inverseLabel = inverseLabelForGroup(group, types);
    const typeId = typeUrlForGroup(group, types);

    const color = edgeColorForType(
      group ? primaryTypeOfSet(group.directTypeIds, types) : undefined,
      types,
    );

    if (aggregate.forward.size > 0) {
      edges.push({
        kind: "aggregate",
        visualKey: VisualEdgeKey(
          `agg:${pairKey}:${aggregate.typeSetId as number}:forward`,
        ),
        source,
        target,
        pairKey,
        typeSetId: aggregate.typeSetId,
        typeId,
        direction: "forward",
        collapsed: false,
        count: aggregate.forward.size,
        totalPairCount: pair.totalCount,
        distinctTypeCount: aggregations.length,
        color,
        widthWorld: widthForCount(aggregate.forward.size),
        typeLabel,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        // Copied (not aliased): the aggregation sets mutate incrementally
        // while emitted frames must stay stable snapshots.
        entities: new Set(aggregate.forward),
      });
    }

    if (aggregate.reverse.size > 0) {
      edges.push({
        kind: "aggregate",
        visualKey: VisualEdgeKey(
          `agg:${pairKey}:${aggregate.typeSetId as number}:reverse`,
        ),
        source,
        target,
        pairKey,
        typeSetId: aggregate.typeSetId,
        typeId,
        direction: "reverse",
        collapsed: false,
        count: aggregate.reverse.size,
        totalPairCount: pair.totalCount,
        distinctTypeCount: aggregations.length,
        color,
        widthWorld: widthForCount(aggregate.reverse.size),
        typeLabel: inverseLabel,
        // Assigned once the final visualEdges order is known (#buildFrame).
        laneId: -1,
        // Copied (not aliased), as with the forward lane above.
        entities: new Set(aggregate.reverse),
      });
    }
  }

  return edges;
}

/**
 * Maintains edge aggregation state across frames. When the LOD cut changes,
 * only links whose visible owner changed are reclassified; falls back to
 * full recomputation when >35% of entities changed owners.
 *
 * Incremental updates rely on the {@link LinkStore} being append-only: links
 * with id below `#appliedLinkCount` are already folded into the state, the
 * tail is applied fresh each update. Endpoint resolutions (a pending `-1`
 * side filling in) are replayed from the store's resolution log so the undo
 * uses the values the link was originally applied with -- undoing with the
 * freshly-resolved endpoints would decrement a pair bucket the link never
 * contributed to.
 */
export class EdgeAggregator {
  readonly #pairs = new Map<string, MutablePairAggregation>();
  readonly #individuals = new Map<number, StoredIndividualEdge>();
  #hiddenCount = 0;
  #previousCutIndex: CutView | undefined;
  /** Links with id below this are folded into the aggregation state. */
  #appliedLinkCount = 0;

  reset(): void {
    this.#pairs.clear();
    this.#individuals.clear();
    this.#hiddenCount = 0;
    this.#previousCutIndex = undefined;
    this.#appliedLinkCount = 0;
  }

  /** Update aggregation for a new LOD cut. */
  update(
    cutIndex: CutView,
    linkStore: LinkStore,
    typeSets: TypeSetStore,
    types: TypeRegistry,
    config: VizConfig,
  ): EdgeFrame {
    // Consume the resolution log unconditionally: after a full recompute its
    // entries are stale (the rebuild reads current endpoint values directly).
    const resolvedEndpoints = linkStore.drainResolvedEndpoints();

    if (!this.#previousCutIndex) {
      this.#fullRecompute(cutIndex, linkStore);
    } else {
      const changedEntities = this.#findChangedEntities(cutIndex);
      const changeRatio = changedEntities.size / Math.max(1, cutIndex.size);

      if (changeRatio > 0.35) {
        this.#fullRecompute(cutIndex, linkStore);
      } else {
        // Sides that were still -1 when their link was applied, keyed by
        // link. Resolutions of links at or beyond #appliedLinkCount are
        // dropped: those links were never applied and the tail pass below
        // reads their current (already resolved) endpoints.
        const resolvedSides = new Map<LinkId, Array<"left" | "right">>();
        for (const { linkId, side } of resolvedEndpoints) {
          if (linkId >= this.#appliedLinkCount) {
            continue;
          }
          const sides = resolvedSides.get(linkId);
          if (sides) {
            sides.push(side);
          } else {
            resolvedSides.set(linkId, [side]);
          }
        }

        if (changedEntities.size > 0) {
          this.#incrementalUpdate(
            changedEntities,
            cutIndex,
            linkStore,
            resolvedSides,
          );
        }
        this.#reapplyResolved(resolvedSides, cutIndex, linkStore);
        this.#applyTail(cutIndex, linkStore);
      }
    }

    this.#previousCutIndex = cutIndex;
    return this.#buildFrame(typeSets, types, config);
  }

  // Accessors for edge-geometry fan-out

  get pairs(): ReadonlyMap<string, MutablePairAggregation> {
    return this.#pairs;
  }

  /** Apply (sign = +1) or undo (sign = -1) a link's aggregation contribution. */
  #applyLink(
    linkId: LinkId,
    leftIndex: EntityIndex | -1,
    rightIndex: EntityIndex | -1,
    typeSetId: TypeSetId,
    linkEntityIdx: EntityIndex,
    cutIndex: CutView,
    sign: 1 | -1,
  ): void {
    if (leftIndex === -1 || rightIndex === -1) {
      this.#hiddenCount += sign;
      return;
    }

    const leftOwner = cutIndex.ownerOf(leftIndex);
    const rightOwner = cutIndex.ownerOf(rightIndex);

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
            leftEntityIndex: leftIndex,
            rightEntityIndex: rightIndex,
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

    // "forward" = flow matches PairKey sort order (source is the lower-sorted cluster).
    const forward = leftOwner === sourceId;

    if (sign === 1) {
      let pair = this.#pairs.get(key);
      if (!pair) {
        pair = { sourceId, targetId, byType: new Map(), totalCount: 0 };
        this.#pairs.set(key, pair);
      }

      let aggregation = pair.byType.get(typeSetId);

      if (!aggregation) {
        aggregation = {
          typeSetId,
          forward: new Set(),
          reverse: new Set(),
        };

        pair.byType.set(typeSetId, aggregation);
      }

      if (forward) {
        aggregation.forward.add(linkEntityIdx);
      } else {
        aggregation.reverse.add(linkEntityIdx);
      }

      pair.totalCount += 1;
      return;
    }

    const pair = this.#pairs.get(key);
    if (pair === undefined) {
      return;
    }

    const aggregation = pair.byType.get(typeSetId);
    if (aggregation) {
      if (forward) {
        aggregation.forward.delete(linkEntityIdx);
      } else {
        aggregation.reverse.delete(linkEntityIdx);
      }

      if (aggregation.forward.size === 0 && aggregation.reverse.size === 0) {
        pair.byType.delete(typeSetId);
      }
    }

    pair.totalCount -= 1;
    if (pair.totalCount <= 0) {
      this.#pairs.delete(key);
    }
  }

  #fullRecompute(cutIndex: CutView, linkStore: LinkStore): void {
    this.#pairs.clear();
    this.#individuals.clear();
    this.#hiddenCount = 0;

    for (let link = 0; link < linkStore.count; link++) {
      this.#applyLink(
        link as LinkId,
        linkStore.getLeft(link),
        linkStore.getRight(link),
        linkStore.getTypeSetId(link),
        linkStore.getEntityIndex(link),
        cutIndex,
        1,
      );
    }
    this.#appliedLinkCount = linkStore.count;
  }

  #incrementalUpdate(
    changedEntities: Set<EntityIndex>,
    newCutIndex: CutView,
    linkStore: LinkStore,
    resolvedSides: ReadonlyMap<LinkId, ReadonlyArray<"left" | "right">>,
  ): void {
    const oldCutIndex = this.#previousCutIndex!;
    const processedLinks = new Set<LinkId>();

    for (const entityIdx of changedEntities) {
      for (const link of linkStore.linksFor(entityIdx)) {
        if (processedLinks.has(link.linkId)) {
          continue;
        }

        processedLinks.add(link.linkId);

        // Not yet applied (tail) or applied with a since-resolved -1 side:
        // #applyTail / #reapplyResolved handle these with the exact values
        // the state saw; undoing them here with current endpoints would
        // corrupt counts they never contributed to.
        if (
          link.linkId >= this.#appliedLinkCount ||
          resolvedSides.has(link.linkId)
        ) {
          continue;
        }

        const leftIdx = linkStore.getLeft(link.linkId);
        const rightIdx = linkStore.getRight(link.linkId);
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

  /**
   * Reclassify links whose pending endpoint resolved since the last update:
   * undo with the as-applied endpoints (resolved sides restored to -1, which
   * classified the link as hidden), then apply with the real endpoints.
   */
  #reapplyResolved(
    resolvedSides: ReadonlyMap<LinkId, ReadonlyArray<"left" | "right">>,
    newCutIndex: CutView,
    linkStore: LinkStore,
  ): void {
    const oldCutIndex = this.#previousCutIndex!;

    for (const [linkId, sides] of resolvedSides) {
      const leftIdx = linkStore.getLeft(linkId);
      const rightIdx = linkStore.getRight(linkId);
      const typeSetId = linkStore.getTypeSetId(linkId);
      const linkEntityIdx = linkStore.getEntityIndex(linkId);

      this.#applyLink(
        linkId,
        sides.includes("left") ? -1 : leftIdx,
        sides.includes("right") ? -1 : rightIdx,
        typeSetId,
        linkEntityIdx,
        oldCutIndex,
        -1,
      );

      this.#applyLink(
        linkId,
        leftIdx,
        rightIdx,
        typeSetId,
        linkEntityIdx,
        newCutIndex,
        1,
      );
    }
  }

  /**
   * Fold in links inserted since the last update. Catches link-only batches
   * between already-visible entities, which `#findChangedEntities` cannot
   * see: it tracks entity ownership, and a new link changes no owners.
   */
  #applyTail(cutIndex: CutView, linkStore: LinkStore): void {
    for (let link = this.#appliedLinkCount; link < linkStore.count; link++) {
      this.#applyLink(
        link as LinkId,
        linkStore.getLeft(link),
        linkStore.getRight(link),
        linkStore.getTypeSetId(link),
        linkStore.getEntityIndex(link),
        cutIndex,
        1,
      );
    }
    this.#appliedLinkCount = linkStore.count;
  }

  #findChangedEntities(newCutIndex: CutView): Set<EntityIndex> {
    const changed = new Set<EntityIndex>();
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
          entityIdx: edge.leftEntityIndex,
          ownerClusterId: edge.ownerClusterId,
        },
        target: {
          kind: "entity",
          entityIdx: edge.rightEntityIndex,
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
