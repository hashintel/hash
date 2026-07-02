/* eslint-disable no-param-reassign */
import { MutableCircle } from "../../geometry";
import { ClusterId } from "../../ids";
import { hslToRgb } from "../../math/color";
import { murmur3StringUnit } from "../../math/hash";
import { graphColors } from "../../visual-style";
import { Column } from "../collections/column";
import { subclusterByLinks } from "./community";

import type { VizConfig } from "../../config";
import type { Color } from "../../frames";
import type { ClusterKind, EntityIndex, TypeId, TypeSetKey } from "../../ids";
import type { LinkStore } from "../store/link";
import type { TypeRegistry } from "../store/type-registry";
import type { TypeSetGroup, TypeSetStore } from "../store/type-set";

function stableHashToAngle(id: string): number {
  return murmur3StringUnit(id) * 2 * Math.PI;
}

/**
 * Display label for a cluster, plus the classification metadata behind it.
 *
 * `primaryType` is the type that decided the label, or `null` for generic
 * rollup labels ("All entities", "More", "Mixed entities"). `coverage` is
 * the fraction of the cluster's mass covered by `primaryType`; `isMixed`
 * marks labels below the "clean" coverage threshold, shown to the user
 * with a "Mostly " prefix.
 */
export class ClusterLabel {
  readonly text: string;
  readonly primaryType: TypeId | null;
  readonly coverage: number;
  readonly isMixed: boolean;

  constructor(
    text?: string,
    primaryType?: TypeId | null,
    coverage?: number,
    isMixed?: boolean,
  ) {
    this.text = text ?? "";
    this.primaryType = primaryType ?? null;
    this.coverage = coverage ?? 0;
    this.isMixed = isMixed ?? true;
  }
}

/**
 * Per-cluster accumulator of type membership counts, tracked as `direct`
 * (only a group's own type ids) and `closure` (direct types plus their
 * ancestors) mass.
 *
 * Labeling reads these maps to find the type that best explains a
 * cluster; `absorb` merges another cluster's mass in when subtrees are
 * rolled up into a family node.
 */
export class ClusterMass {
  readonly direct = new Map<TypeId, number>();
  readonly closure = new Map<TypeId, number>();

  addGroup(group: TypeSetGroup): void {
    for (const typeIdx of group.directTypeIds) {
      this.direct.set(typeIdx, (this.direct.get(typeIdx) ?? 0) + group.count);
    }
    for (const typeIdx of group.closure.members()) {
      this.closure.set(typeIdx, (this.closure.get(typeIdx) ?? 0) + group.count);
    }
  }

  removeGroup(group: TypeSetGroup, entityCount: number): void {
    for (const typeIdx of group.directTypeIds) {
      const prev = this.direct.get(typeIdx) ?? 0;
      this.direct.set(typeIdx, Math.max(0, prev - entityCount));
    }
    for (const typeIdx of group.closure.members()) {
      const prev = this.closure.get(typeIdx) ?? 0;
      this.closure.set(typeIdx, Math.max(0, prev - entityCount));
    }
  }

  incrementForGroup(group: TypeSetGroup, delta: number): void {
    for (const typeIdx of group.directTypeIds) {
      this.direct.set(typeIdx, (this.direct.get(typeIdx) ?? 0) + delta);
    }
    for (const typeIdx of group.closure.members()) {
      this.closure.set(typeIdx, (this.closure.get(typeIdx) ?? 0) + delta);
    }
  }

  absorb(other: ClusterMass): void {
    for (const [typeIdx, mass] of other.direct) {
      this.direct.set(typeIdx, (this.direct.get(typeIdx) ?? 0) + mass);
    }
    for (const [typeIdx, mass] of other.closure) {
      this.closure.set(typeIdx, (this.closure.get(typeIdx) ?? 0) + mass);
    }
  }
}

interface GroupMembership {
  readonly source: "groups";
  readonly keys: TypeSetKey[];
}

interface DirectMembership {
  readonly source: "direct";
  readonly members: Column<Int32Array, EntityIndex>;
}

/**
 * How a cluster's entity membership is tracked. `"groups"` clusters
 * (type-set rollups, families) reference their member type-set keys and
 * recompute mass from the live {@link TypeSetStore}; `"direct"` clusters
 * (embedding and community children) hold a materialized column of entity
 * indices instead. `ClusterNode.addGroupMass`, `removeGroupMass`, and
 * `incrementGroupMass` only take effect on `"groups"` nodes.
 */
export type ClusterMembership = GroupMembership | DirectMembership;

/**
 * A node in the cluster hierarchy: an id, a `kind` discriminant, its own
 * type mass, a live `count`, an ordered list of `children`, and a
 * `circle` used for layout.
 *
 * `parent` is stored as a `WeakRef` so a node removed from the tree's
 * registry can be garbage-collected even while a stale sibling or child
 * reference still points at it; use `addChild`/`removeChild` rather than
 * mutating `children` directly so `parent` stays consistent with the tree
 * shape. `count` on `"direct"`-membership nodes is set directly by the
 * caller that materializes the node, not through the mass-mutation
 * methods above.
 */
export class ClusterNode {
  readonly id: ClusterId;
  readonly kind: ClusterKind;
  readonly mass: ClusterMass;
  readonly children: ClusterNode[];
  readonly membership: ClusterMembership;
  count: number;
  label: ClusterLabel;
  readonly circle: MutableCircle;

  #parent: WeakRef<ClusterNode> | null = null;

  constructor(id: ClusterId, kind: ClusterKind, membership: ClusterMembership) {
    this.id = id;
    this.kind = kind;
    this.mass = new ClusterMass();
    this.children = [];
    this.membership = membership;
    this.count = 0;
    this.label = new ClusterLabel();
    this.circle = new MutableCircle();
  }

  get parent(): ClusterNode | null {
    return this.#parent?.deref() ?? null;
  }

  set parent(node: ClusterNode | null) {
    this.#parent = node ? new WeakRef(node) : null;
  }

  addChild(child: ClusterNode): void {
    this.children.push(child);
    child.parent = this;
  }

  removeChild(child: ClusterNode): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    child.parent = null;
  }

  clearChildren(): void {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children.length = 0;
  }

  addGroupMass(group: TypeSetGroup): void {
    if (this.membership.source !== "groups") {
      return;
    }
    if (!this.membership.keys.includes(group.key)) {
      this.membership.keys.push(group.key);
    }
    this.count += group.count;
    this.mass.addGroup(group);
  }

  removeGroupMass(group: TypeSetGroup, entityCount: number): void {
    if (this.membership.source !== "groups") {
      return;
    }
    const keyIdx = this.membership.keys.indexOf(group.key);
    if (keyIdx !== -1) {
      this.membership.keys.splice(keyIdx, 1);
    }
    this.count -= entityCount;
    this.mass.removeGroup(group, entityCount);
  }

  incrementGroupMass(group: TypeSetGroup, delta: number): void {
    this.count += delta;
    this.mass.incrementForGroup(group, delta);
  }
}

/**
 * One type-set's count change for {@link ClusterTree.updateIncrementally}.
 * `previousCount` is the count before this delta was applied, used to
 * detect a small group crossing the standalone-promotion threshold.
 */
export interface IngestDelta {
  readonly groupKey: TypeSetKey;
  readonly delta: number;
  readonly isNewGroup: boolean;
  readonly previousCount: number;
}

function stableSortNodes(nodes: ClusterNode[]): ClusterNode[] {
  return [...nodes].sort(
    (lhs, rhs) => rhs.count - lhs.count || lhs.id.localeCompare(rhs.id),
  );
}

/**
 * Leaf radius: `sqrt(count) * RADIUS_PER_SQRT_COUNT` (default 5). Higher
 * values enlarge all bubbles proportionally; lower values increase
 * overlap risk in force layout.
 */
const RADIUS_PER_SQRT_COUNT = 5;
/** Minimum leaf radius (default 8) regardless of count, so tiny clusters stay clickable. */
const LEAF_MIN_RADIUS = 8;
/** Larger floor so singleton-type top-level bubbles stay clickable. */
const TOP_LEVEL_MIN_RADIUS = 15;
/** Minimum gap (default 2) enforced between sibling circles in {@link enclosingRadius}. */
const ENCLOSE_GAP = 2;
/** Extra margin (default 3) added on top of the enclosing fit so force layout has room to settle children without clipping. */
const ENCLOSE_PADDING = 3;

/**
 * Radius of a circle that can hold children of the given radii without overlap,
 * placed on a ring. A ring is always a valid non-overlapping arrangement, so a
 * confined force layout can always pack the children within this radius. Tight
 * for <= 2 children (the common family case, two circles side by side); a single
 * ring for more (conservative; the force layout then packs them tighter).
 */
export function enclosingRadius(radii: readonly number[], gap: number): number {
  const count = radii.length;
  if (count === 0) {
    return 0;
  }
  if (count === 1) {
    // count === 1 guarantees radii[0] exists.
    return radii[0]!;
  }
  const sorted = [...radii].sort((left, right) => right - left);
  // The two largest children could end up adjacent, size for that worst case.
  // count >= 2 here guarantees sorted[0] and sorted[1] exist after the
  // descending sort.
  const widestPair = sorted[0]! + sorted[1]! + gap;
  if (count === 2) {
    return widestPair;
  }
  const ringRadius = widestPair / (2 * Math.sin(Math.PI / count));
  return ringRadius + sorted[0]!;
}

function documentFrequency(
  clusters: readonly ClusterNode[],
  massKey: "direct" | "closure",
): Map<TypeId, number> {
  const df = new Map<TypeId, number>();

  for (const cluster of clusters) {
    for (const typeIdx of cluster.mass[massKey].keys()) {
      df.set(typeIdx, (df.get(typeIdx) ?? 0) + 1);
    }
  }

  return df;
}

function bestCandidate(
  cluster: ClusterNode,
  mass: Map<TypeId, number>,
  df: Map<TypeId, number>,
  minCoverage: number,
  totalClusters: number,
  types: TypeRegistry,
): { typeIdx: TypeId; coverage: number; score: number } | undefined {
  let best: { typeIdx: TypeId; coverage: number; score: number } | undefined;

  for (const [typeIdx, count] of mass) {
    const coverage = count / cluster.count;
    if (coverage < minCoverage) {
      continue;
    }

    const info = types.get(typeIdx);
    const docFreq = df.get(typeIdx) ?? 1;
    const idf = Math.log((totalClusters + 1) / (docFreq + 1));
    const depth = info?.depth ?? 0;
    const score = coverage * (idf + 0.05 * depth);

    if (
      !best ||
      score > best.score ||
      (score === best.score && depth > (types.get(best.typeIdx)?.depth ?? 0))
    ) {
      best = { typeIdx, coverage, score };
    }
  }

  return best;
}

function distinctiveLabel(
  cluster: ClusterNode,
  directDf: Map<TypeId, number>,
  closureDf: Map<TypeId, number>,
  totalClusters: number,
  types: TypeRegistry,
): ClusterLabel {
  // "other" clusters are heterogeneous; accept lower type coverage.
  const minCoverage = cluster.kind === "other" ? 0.35 : 0.5;

  const candidate =
    bestCandidate(
      cluster,
      cluster.mass.direct,
      directDf,
      minCoverage,
      totalClusters,
      types,
    ) ??
    bestCandidate(
      cluster,
      cluster.mass.closure,
      closureDf,
      // Closure mass is inherited from ancestor types, a weaker signal
      // than direct membership; require majority coverage regardless of
      // cluster kind.
      0.5,
      totalClusters,
      types,
    );

  if (candidate) {
    const info = types.get(candidate.typeIdx);
    const title = info?.title ?? "Unknown";
    // Prefix "Mostly" and set isMixed when coverage is below 0.65.
    const prefix = candidate.coverage < 0.65 ? "Mostly " : "";
    return new ClusterLabel(
      `${prefix}${title}`,
      candidate.typeIdx,
      candidate.coverage,
      candidate.coverage < 0.65,
    );
  }

  return new ClusterLabel("Mixed entities");
}

function findMergeTarget(
  small: TypeSetGroup,
  anchorIndex: Map<TypeId, TypeSetGroup[]>,
  config: VizConfig,
): ClusterId {
  const candidates = new Map<string, TypeSetGroup>();
  for (const typeIdx of small.closure.members()) {
    for (const anchor of anchorIndex.get(typeIdx) ?? []) {
      candidates.set(anchor.key, anchor);
    }
  }

  let best:
    | {
        group: TypeSetGroup;
        rawJaccard: number;
        directSuperset: boolean;
        adjustedScore: number;
      }
    | undefined;

  for (const anchor of candidates.values()) {
    const rawJaccard = small.closure.jaccard(anchor.closure);
    const directSuperset = small.directTypeIds.isSubsetOf(anchor.directTypeIds);
    // Prefer anchors whose direct types are a superset of the small
    // group's, even when Jaccard is tied.
    const adjustedScore = rawJaccard + (directSuperset ? 0.1 : 0);

    if (
      !best ||
      adjustedScore > best.adjustedScore ||
      (adjustedScore === best.adjustedScore && anchor.key < best.group.key)
    ) {
      best = { group: anchor, rawJaccard, directSuperset, adjustedScore };
    }
  }

  if (
    best &&
    (best.rawJaccard >= config.mergeJaccardMin ||
      (best.directSuperset && best.rawJaccard >= config.mergeSubsetJaccardMin))
  ) {
    return best.group.standaloneClusterId;
  }

  const primaryType = small.directTypeIds.items[0] ?? 0;
  return ClusterId(`cluster:other:${primaryType}`);
}

function buildAnchorIndex(typeSets: TypeSetStore): Map<TypeId, TypeSetGroup[]> {
  const index = new Map<TypeId, TypeSetGroup[]>();

  for (const group of typeSets) {
    if (!group.isStandalone || group.count === 0) {
      continue;
    }

    for (const typeIdx of group.closure.members()) {
      let list = index.get(typeIdx);
      if (!list) {
        list = [];
        index.set(typeIdx, list);
      }
      list.push(group);
    }
  }

  return index;
}

const CLUSTER_GOLDEN_ANGLE_DEG = 137.508;
const SUBCLUSTER_HUE_SPAN_DEG = 18;

function clusterDepth(cluster: ClusterNode): number {
  let depth = 0;
  let parent = cluster.parent;
  while (parent?.kind !== "root") {
    depth += 1;
    parent = parent?.parent ?? null;
  }
  return depth;
}

function inheritedPrimaryType(cluster: ClusterNode): {
  typeIdx: TypeId | null;
  inherited: boolean;
} {
  if (cluster.label.primaryType !== null) {
    return { typeIdx: cluster.label.primaryType, inherited: false };
  }
  let parent = cluster.parent;
  while (parent && parent.kind !== "root") {
    if (parent.label.primaryType !== null) {
      return { typeIdx: parent.label.primaryType, inherited: true };
    }
    parent = parent.parent;
  }
  return { typeIdx: null, inherited: false };
}

function siblingTint(cluster: ClusterNode): number {
  const siblings = cluster.parent?.children ?? [];
  const count = siblings.length;
  if (count <= 1) {
    return 0;
  }
  const index = Math.max(
    0,
    siblings.findIndex((sibling) => sibling.id === cluster.id),
  );
  return (index / (count - 1) - 0.5) * SUBCLUSTER_HUE_SPAN_DEG;
}

/**
 * Returns the RGBA fill color for a cluster's bubble.
 *
 * Hue derives from the primary type's color slot, spread by the golden
 * angle (`CLUSTER_GOLDEN_ANGLE_DEG` = 137.508°) so sibling root types
 * stay visually distinct. Clusters that inherit their label from an
 * ancestor (no distinctive type of their own) additionally shift hue via
 * `siblingTint`, spreading up to `SUBCLUSTER_HUE_SPAN_DEG` (18°) across
 * siblings so an inherited family reads as related bubbles. Mixed or
 * low-coverage clusters (`isMixed`, or coverage below 0.55) desaturate
 * toward gray; depth and inheritance both reduce alpha and adjust
 * lightness so nested and inherited bubbles recede behind their more
 * distinctive ancestors.
 */
export function colorForCluster(
  cluster: ClusterNode,
  types: TypeRegistry,
): Color {
  const depth = clusterDepth(cluster);
  const { typeIdx: primaryType, inherited } = inheritedPrimaryType(cluster);
  if (primaryType === null) {
    const alpha = depth > 0 ? 95 : 145;
    return [126, 142, 160, alpha];
  }

  const info = types.get(primaryType);
  const rootIdx = info?.rootIds[0] ?? primaryType;
  const slot = types.colorSlot(rootIdx);
  if (slot === undefined) {
    const alpha = depth > 0 ? 95 : 145;
    return [
      graphColors.fallbackEntity[0],
      graphColors.fallbackEntity[1],
      graphColors.fallbackEntity[2],
      alpha,
    ];
  }

  const rawHue =
    slot * CLUSTER_GOLDEN_ANGLE_DEG + (inherited ? siblingTint(cluster) : 0);
  const hue = ((rawHue % 360) + 360) % 360;
  const mixed = cluster.label.isMixed || cluster.label.coverage < 0.55;
  const [red, green, blue] = hslToRgb(
    hue,
    inherited ? 0.42 : mixed ? 0.36 : 0.6,
    inherited ? 0.6 + Math.min(depth, 3) * 0.045 : depth > 0 ? 0.68 : 0.54,
  );
  return [
    red,
    green,
    blue,
    inherited ? 150 : depth > 0 ? (mixed ? 110 : 150) : mixed ? 165 : 215,
  ];
}

/**
 * Owns the cluster hierarchy: the node registry, lazy subdivision
 * state, and embedding membership. All tree mutations go through
 * this class so invariants (disjoint children, consistent counts,
 * valid parent refs) are maintained in one place.
 */
export class ClusterTree {
  readonly #nodes = new Map<ClusterId, ClusterNode>();
  readonly #root: ClusterNode;
  readonly #subdivisionRequested = new Set<ClusterId>();

  constructor() {
    this.#root = new ClusterNode(ClusterId("cluster:root"), "root", {
      source: "groups",
      keys: [],
    });
    this.#register(this.#root);
  }

  get root(): ClusterNode {
    return this.#root;
  }

  get(id: ClusterId): ClusterNode | undefined {
    return this.#nodes.get(id);
  }

  has(id: ClusterId): boolean {
    return this.#nodes.has(id);
  }

  get size(): number {
    return this.#nodes.size;
  }

  get isEmpty(): boolean {
    return this.#nodes.size <= 1;
  }

  values(): IterableIterator<ClusterNode> {
    return this.#nodes.values();
  }

  atomicSum(): number {
    let sum = 0;
    for (const node of this.#nodes.values()) {
      if (node.kind === "type-set" || node.kind === "other") {
        sum += node.count;
      }
    }
    return sum;
  }

  /**
   * Returns an indented debug string of the full tree (label, count,
   * kind, radius, child count, id). For diagnostics only; not stable
   * across versions.
   */
  debugDump(): string {
    const lines: string[] = [];
    const visit = (node: ClusterNode, depth: number): void => {
      lines.push(
        `${"  ".repeat(depth)}"${node.label.text}" (${node.count}) ` +
          `[${node.kind}] r=${Math.round(node.circle.radius)} ` +
          `nchildren=${node.children.length} id=${node.id}`,
      );
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    };
    visit(this.#root, 0);
    return lines.join("\n");
  }

  /**
   * Full rebuild pipeline: reclassifies type-sets, clears the tree,
   * materializes clusters, recomputes labels, rebuilds the display
   * hierarchy, and lays out top-level radii.
   *
   * Replaces all prior nodes; use {@link ClusterTree.updateIncrementally}
   * after the first batch.
   */
  rebuild(
    typeSets: TypeSetStore,
    types: TypeRegistry,
    config: VizConfig,
  ): void {
    for (const group of typeSets) {
      group.recomputeClosure(types);
    }

    this.#classifyAndMerge(typeSets, config);
    this.#clearAll();
    this.#materializeClusters(typeSets);
    this.#computeLabels(types);
    this.#buildDisplayHierarchy(types, config);
    this.#layoutTopLevel();
  }

  /**
   * Incremental update. Handles count growth, new groups, threshold
   * promotion, and re-targeting of small groups.
   *
   * Nodes left at count 0 after applying deltas are unregistered; dirty
   * nodes are relabeled via {@link distinctiveLabel}; counts propagate up
   * to the root ancestors of every touched node. When a delta triggers a
   * structural change (promotion, re-targeting, a new group, or a node
   * emptying out), family rollup nodes are cleared and the display
   * hierarchy is rebuilt from scratch before layout runs.
   */
  updateIncrementally(
    deltas: readonly IngestDelta[],
    typeSets: TypeSetStore,
    types: TypeRegistry,
    config: VizConfig,
  ): void {
    const dirtyIds = new Set<ClusterId>();
    let needsHierarchyRebuild = false;

    for (const { groupKey } of deltas) {
      typeSets.get(groupKey)?.recomputeClosure(types);
    }

    const anchorIndex = buildAnchorIndex(typeSets);

    for (const { groupKey, delta, isNewGroup, previousCount } of deltas) {
      const group = typeSets.get(groupKey);
      if (!group) {
        continue;
      }

      const crossedThreshold =
        !group.isStandalone &&
        previousCount < config.minStandaloneTypeSet &&
        group.count >= config.minStandaloneTypeSet;

      if (crossedThreshold) {
        const oldNode = this.#nodes.get(group.assignedClusterId);
        if (oldNode) {
          oldNode.removeGroupMass(group, previousCount);
          dirtyIds.add(oldNode.id);
        }

        group.isStandalone = true;
        group.assignedClusterId = group.standaloneClusterId;

        const newNode = this.#ensureNode(group.standaloneClusterId, "type-set");
        newNode.addGroupMass(group);

        if (oldNode) {
          const angle = stableHashToAngle(newNode.id);
          newNode.circle.x =
            oldNode.circle.x + Math.cos(angle) * oldNode.circle.radius * 0.25;
          newNode.circle.y =
            oldNode.circle.y + Math.sin(angle) * oldNode.circle.radius * 0.25;
        }

        dirtyIds.add(newNode.id);
        needsHierarchyRebuild = true;

        const candidates = this.#smallGroupsSharingTypes(group, typeSets);
        for (const small of candidates) {
          const newTarget = findMergeTarget(small, anchorIndex, config);
          if (newTarget !== small.assignedClusterId) {
            const prevNode = this.#nodes.get(small.assignedClusterId);
            if (prevNode) {
              prevNode.removeGroupMass(small, small.count);
              dirtyIds.add(prevNode.id);
            }

            small.assignedClusterId = newTarget;
            const targetNode = this.#ensureNode(
              newTarget,
              newTarget.startsWith("cluster:other:") ? "other" : "type-set",
            );
            targetNode.addGroupMass(small);
            dirtyIds.add(newTarget);
            needsHierarchyRebuild = true;
          }
        }
      } else if (isNewGroup) {
        if (group.count >= config.minStandaloneTypeSet) {
          group.isStandalone = true;
          group.assignedClusterId = group.standaloneClusterId;
        } else {
          group.isStandalone = false;
          group.assignedClusterId = findMergeTarget(group, anchorIndex, config);
        }

        const clusterId = group.assignedClusterId;
        const kind: ClusterKind = clusterId.startsWith("cluster:other:")
          ? "other"
          : "type-set";
        const node = this.#ensureNode(clusterId, kind);
        node.addGroupMass(group);
        dirtyIds.add(clusterId);
        needsHierarchyRebuild = true;
      } else {
        const node = this.#nodes.get(group.assignedClusterId);
        if (node) {
          node.incrementGroupMass(group, delta);
          dirtyIds.add(node.id);
        }
      }
    }

    this.#propagateCountsToRoot(dirtyIds);

    for (const [, node] of this.#nodes) {
      if (node.kind !== "root" && node.count === 0) {
        this.#unregister(node);
        needsHierarchyRebuild = true;
      }
    }

    this.#relabelDirty(dirtyIds, types);

    if (needsHierarchyRebuild) {
      this.#clearFamilyNodes();
      this.#buildDisplayHierarchy(types, config);
    }

    this.#stableLayout();
  }

  /**
   * Synchronously subdivides a leaf cluster via community detection.
   *
   * Returns `false` without mutating the tree when `node.count` is at or
   * below `config.entityRevealMax`, the node already has children, or
   * community detection yields fewer than two groups. On success,
   * registers the new children and lays them out inside `node`.
   */
  ensureSubclusters(
    node: ClusterNode,
    typeSets: TypeSetStore,
    links: LinkStore,
    config: VizConfig,
  ): boolean {
    if (node.count <= config.entityRevealMax) {
      return false;
    }
    if (node.children.length > 0) {
      return false;
    }
    const entityIdxs = this.#collectEntityIdxs(node, typeSets);
    const childNodes = subclusterByLinks(node, entityIdxs, links, config);
    if (childNodes.length < 2) {
      return false;
    }

    for (const child of childNodes) {
      node.addChild(child);
      this.#register(child);
    }

    this.#layoutChildrenInParent(node);
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.debug(
        `[graph-worker][cluster-tree] subdivided ${node.id} (${node.count}) ` +
          `into ${childNodes.length} groups:`,
        childNodes.map((ch) => `${ch.label.text} (${ch.count})`).join(", "),
      );
    }
    return true;
  }

  needsEmbeddingSubdivision(node: ClusterNode, config: VizConfig): boolean {
    if (node.count <= config.entityRevealMax) {
      return false;
    }
    // Entity-bucket children are placeholders; still needs real subdivision.
    const hasRealChildren =
      node.children.length >= 2 &&
      node.children.some((child) => child.kind !== "entity-bucket");
    if (hasRealChildren) {
      return false;
    }
    return !this.#subdivisionRequested.has(node.id);
  }

  markSubdivisionRequested(id: ClusterId): void {
    this.#subdivisionRequested.add(id);
  }

  applyEmbeddingResult(
    id: ClusterId,
    childAssignments: readonly {
      readonly childId: ClusterId;
      readonly count: number;
      readonly memberIdxs: Int32Array;
    }[],
  ): void {
    const node = this.#nodes.get(id);
    if (!node) {
      return;
    }

    // When embedding subdivision returns no assignments, leave existing
    // entity-bucket children in place. The subdivision request stays
    // consumed (see markSubdivisionRequested), so the worker will not
    // retry until the cluster is rebuilt or the tree is reset; callers
    // must treat empty results as a terminal fallback to coarse buckets.
    if (childAssignments.length === 0) {
      return;
    }

    node.clearChildren();

    for (const { childId, count, memberIdxs } of childAssignments) {
      const members = new Column<Int32Array, EntityIndex>(
        Int32Array,
        memberIdxs.length,
      );
      // memberIdxs originate from entity index columns; branding matches
      // EntityIndex.
      for (const idx of memberIdxs) {
        members.push(idx as EntityIndex);
      }
      const child = new ClusterNode(childId, "embedding", {
        source: "direct",
        members,
      });
      child.count = count;
      child.label = new ClusterLabel(
        `Similar group ${node.children.length + 1}`,
      );

      node.addChild(child);
      this.#register(child);
    }

    this.#layoutChildrenInParent(node);
  }

  /**
   * Sets a cluster's display label. Embedding and community nodes keep
   * this text across `#computeLabels` / `#relabelDirty` passes.
   */
  setLabelText(id: ClusterId, text: string): void {
    const node = this.#nodes.get(id);
    if (node) {
      node.label = new ClusterLabel(text);
    }
  }

  #collectEntityIdxs(
    node: ClusterNode,
    typeSets: TypeSetStore,
  ): Column<Int32Array, EntityIndex> {
    if (node.membership.source === "direct") {
      return node.membership.members;
    }

    let total = 0;
    for (const key of node.membership.keys) {
      const group = typeSets.get(key);
      if (group) {
        total += group.entities.length;
      }
    }

    const result = new Column<Int32Array, EntityIndex>(Int32Array, total);
    for (const key of node.membership.keys) {
      const group = typeSets.get(key);
      if (group) {
        for (const idx of group.entities) {
          result.push(idx);
        }
      }
    }
    return result;
  }

  #register(node: ClusterNode): void {
    this.#nodes.set(node.id, node);
  }

  #unregister(node: ClusterNode): void {
    node.parent?.removeChild(node);
    this.#nodes.delete(node.id);
  }

  #clearAll(): void {
    this.#root.clearChildren();
    this.#nodes.clear();
    this.#subdivisionRequested.clear();
    this.#register(this.#root);
  }

  #clearFamilyNodes(): void {
    for (const [, node] of this.#nodes) {
      if (node.kind === "family") {
        node.clearChildren();
        this.#unregister(node);
      }
    }
  }

  #ensureNode(id: ClusterId, kind: ClusterKind): ClusterNode {
    let node = this.#nodes.get(id);
    if (!node) {
      node = new ClusterNode(id, kind, { source: "groups", keys: [] });
      this.#register(node);
    }
    return node;
  }

  #classifyAndMerge(typeSets: TypeSetStore, config: VizConfig): void {
    const anchors: TypeSetGroup[] = [];
    const small: TypeSetGroup[] = [];

    for (const group of typeSets) {
      if (group.count === 0) {
        continue;
      }
      if (group.count >= config.minStandaloneTypeSet) {
        anchors.push(group);
      } else {
        small.push(group);
      }
    }

    if (anchors.length === 0 && small.length > 0) {
      const promoted = [...small]
        .sort(
          (lhs, rhs) => rhs.count - lhs.count || lhs.key.localeCompare(rhs.key),
        )
        .slice(0, Math.min(8, small.length));
      for (const group of promoted) {
        anchors.push(group);
      }
    }

    const anchorIndex = new Map<TypeId, TypeSetGroup[]>();
    for (const anchor of anchors) {
      for (const typeIdx of anchor.closure.members()) {
        let list = anchorIndex.get(typeIdx);
        if (!list) {
          list = [];
          anchorIndex.set(typeIdx, list);
        }
        list.push(anchor);
      }
    }

    for (const anchor of anchors) {
      anchor.assignedClusterId = anchor.standaloneClusterId;
      anchor.isStandalone = true;
    }

    for (const group of small) {
      if (anchors.includes(group)) {
        group.assignedClusterId = group.standaloneClusterId;
        group.isStandalone = true;
        continue;
      }
      group.assignedClusterId = findMergeTarget(group, anchorIndex, config);
      group.isStandalone = false;
    }
  }

  #materializeClusters(typeSets: TypeSetStore): void {
    const groupsByCluster = new Map<ClusterId, TypeSetGroup[]>();
    for (const group of typeSets) {
      if (group.count === 0) {
        continue;
      }
      let list = groupsByCluster.get(group.assignedClusterId);
      if (!list) {
        list = [];
        groupsByCluster.set(group.assignedClusterId, list);
      }
      list.push(group);
    }

    for (const [clusterId, groups] of groupsByCluster) {
      const kind: ClusterKind = clusterId.startsWith("cluster:other:")
        ? "other"
        : "type-set";
      const node = new ClusterNode(clusterId, kind, {
        source: "groups",
        keys: [],
      });

      for (const group of groups) {
        node.addGroupMass(group);
      }

      this.#root.addChild(node);
      this.#root.count += node.count;
      this.#register(node);
    }
  }

  #computeLabels(types: TypeRegistry): void {
    const atomic = [...this.#nodes.values()].filter(
      (node) => node.kind === "type-set" || node.kind === "other",
    );

    const directDf = documentFrequency(atomic, "direct");
    const closureDf = documentFrequency(atomic, "closure");

    for (const node of atomic) {
      node.label = distinctiveLabel(
        node,
        directDf,
        closureDf,
        atomic.length,
        types,
      );
    }
  }

  #relabelDirty(dirtyIds: Set<ClusterId>, types: TypeRegistry): void {
    const atomic = [...this.#nodes.values()].filter(
      (node) => node.kind === "type-set" || node.kind === "other",
    );

    const directDf = documentFrequency(atomic, "direct");
    const closureDf = documentFrequency(atomic, "closure");

    for (const id of dirtyIds) {
      const node = this.#nodes.get(id);
      if (!node || (node.kind !== "type-set" && node.kind !== "other")) {
        continue;
      }
      node.label = distinctiveLabel(
        node,
        directDf,
        closureDf,
        atomic.length,
        types,
      );
    }
  }

  #makeRollupNode(
    id: ClusterId,
    kind: ClusterKind,
    sourceNodes: readonly ClusterNode[],
    label?: ClusterLabel,
  ): ClusterNode {
    const node = new ClusterNode(id, kind, { source: "groups", keys: [] });
    for (const source of sourceNodes) {
      node.count += source.count;
      node.mass.absorb(source.mass);
    }
    if (label) {
      node.label = label;
    }
    return node;
  }

  #bucketByPrimaryRoot(
    atomicNodes: readonly ClusterNode[],
    types: TypeRegistry,
  ): Map<TypeId | undefined, ClusterNode[]> {
    const buckets = new Map<TypeId | undefined, ClusterNode[]>();

    for (const node of atomicNodes) {
      const primaryType = node.label.primaryType;
      const rootIdx =
        primaryType !== null ? types.get(primaryType)?.rootIds[0] : undefined;

      let list = buckets.get(rootIdx);
      if (!list) {
        list = [];
        buckets.set(rootIdx, list);
      }
      list.push(node);
    }

    return buckets;
  }

  #buildBoundedRollupSubtree(
    parent: ClusterNode,
    children: ClusterNode[],
    maxChildren: number,
  ): void {
    if (children.length <= maxChildren) {
      for (const child of stableSortNodes(children)) {
        parent.addChild(child);
      }
      return;
    }

    const sorted = stableSortNodes(children);
    const direct = sorted.slice(0, maxChildren - 1);
    const overflow = sorted.slice(maxChildren - 1);

    for (const child of direct) {
      parent.addChild(child);
    }

    if (overflow.length > 0) {
      const other = this.#makeRollupNode(
        ClusterId(`cluster:family:overflow:${parent.id}`),
        "family",
        overflow,
        new ClusterLabel("More"),
      );
      parent.addChild(other);
      this.#register(other);

      if (overflow.length > maxChildren) {
        this.#buildBoundedRollupSubtree(other, overflow, maxChildren);
      } else {
        for (const child of overflow) {
          other.addChild(child);
        }
      }
    }
  }

  #buildDisplayHierarchy(types: TypeRegistry, config: VizConfig): void {
    this.#root.clearChildren();

    const atomicNodes = [...this.#nodes.values()].filter(
      (node) => node.kind === "type-set" || node.kind === "other",
    );

    const buckets = this.#bucketByPrimaryRoot(atomicNodes, types);
    const topLevel: ClusterNode[] = [];

    for (const [rootTypeIdx, bucketNodes] of buckets) {
      if (bucketNodes.length === 1) {
        // bucketNodes.length === 1 in this branch.
        topLevel.push(bucketNodes[0]!);
        continue;
      }

      const rootName =
        rootTypeIdx !== undefined ? (types.get(rootTypeIdx)?.title ?? "") : "";
      const rootTitle = rootName.length > 0 ? rootName : "Other";
      const family = this.#makeRollupNode(
        ClusterId(`cluster:family:${rootTypeIdx ?? "unknown"}`),
        "family",
        bucketNodes,
        new ClusterLabel(rootTitle, rootTypeIdx ?? null, 1, false),
      );
      this.#register(family);
      topLevel.push(family);

      this.#buildBoundedRollupSubtree(
        family,
        bucketNodes,
        config.maxChildrenPerParent,
      );
    }

    if (topLevel.length <= config.maxChildrenPerParent) {
      for (const child of stableSortNodes(topLevel)) {
        this.#root.addChild(child);
      }
    } else {
      this.#buildBoundedRollupSubtree(
        this.#root,
        topLevel,
        config.maxChildrenPerParent,
      );
    }

    this.#root.count = this.#root.children.reduce(
      (sum, child) => sum + child.count,
      0,
    );
    this.#root.label = new ClusterLabel("All entities", null, 1, true);
  }

  /**
   * Bottom-up circle-packing radii. Family rollups grow to enclose their
   * children so small siblings never overlap inside a count-sized container.
   * Subdivided type-sets are sized top-down in `#layoutChildrenInParent`
   * and stay count-based here so drilling in doesn't reflow the top level.
   */
  #assignRadii(): void {
    for (const child of this.#root.children) {
      this.#sizeNodeRadius(child);
    }
  }

  #sizeNodeRadius(node: ClusterNode): void {
    const countRadius = Math.max(
      LEAF_MIN_RADIUS,
      Math.sqrt(node.count) * RADIUS_PER_SQRT_COUNT,
    );

    if (node.kind === "family" && node.children.length > 0) {
      for (const child of node.children) {
        this.#sizeNodeRadius(child);
      }
      const childRadii = node.children.map((child) => child.circle.radius);
      const fit = enclosingRadius(childRadii, ENCLOSE_GAP) + ENCLOSE_PADDING;
      node.circle.radius = Math.max(countRadius, fit);
    } else {
      node.circle.radius = countRadius;
    }
  }

  #layoutTopLevel(): void {
    const children = this.#root.children;
    if (children.length === 0) {
      return;
    }

    this.#assignRadii();

    for (let idx = 0; idx < children.length; idx++) {
      // idx iterates 0..children.length-1.
      const child = children[idx]!;
      child.circle.radius = Math.max(TOP_LEVEL_MIN_RADIUS, child.circle.radius);
    }
  }

  #stableLayout(): void {
    const children = this.#root.children;
    if (children.length === 0) {
      return;
    }

    this.#assignRadii();

    for (const child of children) {
      child.circle.radius = Math.max(TOP_LEVEL_MIN_RADIUS, child.circle.radius);
    }
  }

  #layoutChildrenInParent(parent: ClusterNode): void {
    const children = parent.children;
    if (children.length === 0) {
      return;
    }

    const totalCount = children.reduce((sum, child) => sum + child.count, 0);

    for (const child of children) {
      // Scale child radius by sqrt(count share) of parent, capped at
      // LEAF_MIN_RADIUS (8); 0.6 leaves margin for force-layout gaps
      // inside the parent.
      child.circle.radius = Math.max(
        8,
        parent.circle.radius * Math.sqrt(child.count / totalCount) * 0.6,
      );
    }
  }

  #propagateCountsToRoot(dirtyIds: Set<ClusterId>): void {
    const visited = new Set<ClusterId>();

    for (const id of dirtyIds) {
      let current = this.#nodes.get(id);
      while (current?.parent && !visited.has(current.parent.id)) {
        visited.add(current.parent.id);
        const parentNode = current.parent;
        parentNode.count = parentNode.children.reduce(
          (sum, child) => sum + child.count,
          0,
        );
        current = parentNode;
      }
    }
  }

  #smallGroupsSharingTypes(
    promoted: TypeSetGroup,
    typeSets: TypeSetStore,
  ): TypeSetGroup[] {
    const result: TypeSetGroup[] = [];
    for (const group of typeSets) {
      if (
        group.isStandalone ||
        group.count === 0 ||
        group.key === promoted.key
      ) {
        continue;
      }
      if (group.closure.jaccard(promoted.closure) > 0) {
        result.push(group);
      }
    }
    return result;
  }
}
