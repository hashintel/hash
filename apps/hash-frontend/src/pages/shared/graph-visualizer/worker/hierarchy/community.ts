/**
 * Community detection for sub-clustering large type-set clusters.
 *
 * Runs lazily when a cluster is about to open and is too large to show
 * individual entities. Connected components are extracted first; large
 * components are further split by bounded label propagation.
 */

import { ClusterId } from "../../ids";
import { murmur3String } from "../../math/hash";
import { deterministicShuffle } from "../../math/random";
import { Column } from "../collections/column";
import {
  type CsrGraph,
  buildInducedCsr,
  connectedComponents,
} from "../csr-graph";
import { ClusterLabel, ClusterNode } from "./cluster-tree";

import type { VizConfig } from "../../config";
import type { EntityIndex } from "../../ids";
import type { LinkStore } from "../store/link";

/**
 * Synchronous label-propagation community detection on a single connected
 * component of `graph`.
 *
 * Returns per-node community labels as an `Int32Array` indexed by the
 * same local node ids as `graph` (entries outside `component` are left
 * at their zero-initialized default). Stops early once fewer than 0.5%
 * of the component's nodes change label in a pass, or after 20
 * iterations. A size-penalty exponent (`alpha` = 0.35) discourages
 * joining already-large communities, and a small stability bias (0.01)
 * favors keeping a node's current label on ties, together limiting
 * runaway mega-communities.
 */
export function boundedLabelPropagation(
  graph: CsrGraph,
  component: number[],
): Int32Array {
  const nodeCount = graph.nodeIds.length;
  const labels = new Int32Array(nodeCount);
  const sizes = new Int32Array(nodeCount);

  for (const localIdx of component) {
    labels[localIdx] = localIdx;
    sizes[localIdx] = 1;
  }

  // Extra passes rarely change labels after convergence; raising this
  // slows large components linearly.
  const maxIterations = 20;
  // Penalizes joining large communities; lower values merge more
  // aggressively.
  const alpha = 0.35;
  // Breaks ties toward the current label to reduce oscillation.
  const stabilityBias = 0.01;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = 0;
    const order = deterministicShuffle(component, iteration);

    // node is a local CSR index in this component; labels/sizes were
    // initialized for every component member above, and graph.offsets
    // bounds valid neighbor/weight indices for any node in the graph.
    for (const node of order) {
      const current = labels[node]!;
      const scores = new Map<number, number>();

      for (
        let edge = graph.offsets[node]!;
        edge < graph.offsets[node + 1]!;
        edge++
      ) {
        const neighbor = graph.neighbors[edge]!;
        const label = labels[neighbor]!;
        const weight = graph.weights[edge]!;
        scores.set(label, (scores.get(label) ?? 0) + weight);
      }

      scores.set(current, (scores.get(current) ?? 0) + stabilityBias);

      let bestLabel = current;
      let bestScore = -Infinity;

      for (const [label, rawScore] of scores) {
        const sizePenalty = Math.max(1, sizes[label]!) ** alpha;
        const score = rawScore / sizePenalty;
        if (score > bestScore || (score === bestScore && label < bestLabel)) {
          bestScore = score;
          bestLabel = label;
        }
      }

      if (bestLabel !== current) {
        sizes[current]!--;
        sizes[bestLabel]!++;
        labels[node] = bestLabel;
        changed++;
      }
    }

    // Stop when fewer than 0.5% of component nodes relabel in one pass
    // (empirical convergence threshold for link graphs).
    if (changed / component.length < 0.005) {
      break;
    }
  }

  return labels;
}

function labelsToCommunities(
  labels: Int32Array,
  component: number[],
): number[][] {
  const communities = new Map<number, number[]>();

  for (const localIdx of component) {
    const label = labels[localIdx]!;
    let list = communities.get(label);
    if (!list) {
      list = [];
      communities.set(label, list);
    }
    list.push(localIdx);
  }

  return [...communities.values()];
}

function normalizeCommunitySizes(
  communities: number[][],
  graph: CsrGraph,
  config: VizConfig,
): EntityIndex[][] {
  const result: EntityIndex[][] = [];
  const tiny: EntityIndex[] = [];

  for (const community of communities) {
    const entityIdxs = community.map((local) => graph.nodeIds.get(local));

    if (entityIdxs.length < config.communityMinSize) {
      for (const idx of entityIdxs) {
        tiny.push(idx);
      }
    } else if (entityIdxs.length > config.communityMaxSize) {
      for (
        let start = 0;
        start < entityIdxs.length;
        start += config.communityMaxSize
      ) {
        result.push(entityIdxs.slice(start, start + config.communityMaxSize));
      }
    } else {
      result.push(entityIdxs);
    }
  }

  if (tiny.length > 0) {
    result.push(tiny);
  }

  return result;
}

function topDegreeEntity(
  members: EntityIndex[],
  links: LinkStore,
): EntityIndex | undefined {
  let bestIdx: EntityIndex | undefined;
  let bestDegree = 0;

  for (const entityIdx of members) {
    const degree = links.degreeOf(entityIdx);

    if (degree > bestDegree) {
      bestDegree = degree;
      bestIdx = entityIdx;
    }
  }

  return bestIdx;
}

function collectLinkFeatures(
  members: EntityIndex[],
  links: LinkStore,
): Map<string, number> {
  const features = new Map<string, number>();
  const memberSet = new Set(members);

  for (const entityIdx of members) {
    const endpoints = links.linksFor(entityIdx);
    for (const endpoint of endpoints) {
      const isInternal = memberSet.has(endpoint.otherId);
      const prefix = isInternal ? "int" : "ext";
      const key = `${prefix}:${endpoint.direction}:${endpoint.typeSetId}`;
      features.set(key, (features.get(key) ?? 0) + 1);
    }
  }

  return features;
}

function featureKeyToLabel(key: string): string {
  const parts = key.split(":");
  const scope = parts[0] === "int" ? "Internal" : "External";
  const direction = parts[1] === "out" ? "outgoing" : "incoming";
  return `${scope} ${direction} links`;
}

/** Label communities using overrepresented link features (TF-IDF across siblings). */
function labelAllCommunities(
  communityMembers: EntityIndex[][],
  children: ClusterNode[],
  links: LinkStore,
): void {
  if (communityMembers.length === 0) {
    return;
  }

  const allFeatures: Map<string, number>[] = communityMembers.map((members) =>
    collectLinkFeatures(members, links),
  );

  const df = new Map<string, number>();
  for (const features of allFeatures) {
    for (const key of features.keys()) {
      df.set(key, (df.get(key) ?? 0) + 1);
    }
  }

  const totalCommunities = communityMembers.length;

  for (let idx = 0; idx < children.length; idx++) {
    const features = allFeatures[idx]!;
    const memberCount = communityMembers[idx]!.length;
    const child = children[idx]!;

    let bestKey: string | undefined;
    let bestScore = -Infinity;
    let bestCoverage = 0;

    for (const [featureKey, count] of features) {
      const coverage = count / memberCount;
      // Require the link feature in at least a quarter of members before
      // naming a community by it.
      if (coverage < 0.25) {
        continue;
      }

      const docFreq = df.get(featureKey) ?? 1;
      const idf = Math.log((totalCommunities + 1) / (docFreq + 1));
      const score = coverage * idf;

      if (score > bestScore) {
        bestScore = score;
        bestKey = featureKey;
        bestCoverage = coverage;
      }
    }

    if (bestKey) {
      child.label = new ClusterLabel(
        featureKeyToLabel(bestKey),
        null,
        bestCoverage,
        bestCoverage < 0.5,
      );
    } else {
      const hub = topDegreeEntity(communityMembers[idx]!, links);
      child.label = hub
        ? new ClusterLabel(`Around entity ${hub}`)
        : new ClusterLabel(`Community ${idx + 1}`);
    }
  }
}

function linkSignatureKey(
  entityIdx: EntityIndex,
  links: LinkStore,
  maxBuckets: number,
): string {
  const degree = links.degreeOf(entityIdx);
  if (degree === 0) {
    return "isolated";
  }

  const features = new Set<string>();
  for (const endpoint of links.linksFor(entityIdx)) {
    features.add(`${endpoint.direction}:${endpoint.typeSetId}`);
  }

  const sorted = [...features].sort();
  const key = sorted.join("|");

  // eslint-disable-next-line no-bitwise
  return `sig:${(murmur3String(key) >>> 0) % maxBuckets}`;
}

function columnFromIndices(
  indices: ArrayLike<EntityIndex>,
): Column<Int32Array, EntityIndex> {
  const col = new Column<Int32Array, EntityIndex>(Int32Array, indices.length);
  for (let idx = 0; idx < indices.length; idx++) {
    col.push(indices[idx]!);
  }
  return col;
}

function coarseLinkSignatureBuckets(
  cluster: ClusterNode,
  entityIdxs: Column<Int32Array, EntityIndex>,
  links: LinkStore,
  config: VizConfig,
): ClusterNode[] {
  const buckets = new Map<string, EntityIndex[]>();

  for (const entityIdx of entityIdxs) {
    const key = linkSignatureKey(entityIdx, links, config.maxChildrenPerParent);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(entityIdx);
  }

  const normalized = [...buckets.values()];

  const children: ClusterNode[] = normalized.map((memberIdxs, idx) => {
    const members = columnFromIndices(memberIdxs);
    const child = new ClusterNode(
      ClusterId(`${cluster.id}:bucket:${idx}`),
      "community",
      { source: "direct", members },
    );
    child.count = memberIdxs.length;
    child.label = new ClusterLabel(`Group ${idx + 1}`);
    return child;
  });

  labelAllCommunities(normalized, children, links);

  return children;
}

/**
 * Last-resort partitioning when community detection can't produce
 * meaningful groups (e.g. zero internal edges). Splits entities into
 * roughly equal entity-bucket chunks sized for embedding k-means.
 *
 * Buckets are placeholders until embedding subdivision succeeds; if
 * embeddings never arrive, the buckets remain the visible partition.
 */
function deterministicPartition(
  cluster: ClusterNode,
  entityIdxs: Column<Int32Array, EntityIndex>,
  config: VizConfig,
): ClusterNode[] {
  const targetSize = Math.floor(
    config.entityRevealMax * config.embeddingTargetLeafFillRatio,
  );
  const kk = Math.max(
    2,
    Math.min(config.embeddingMaxK, Math.ceil(entityIdxs.length / targetSize)),
  );

  const children: ClusterNode[] = [];
  for (let idx = 0; idx < kk; idx++) {
    const start = Math.floor((idx * entityIdxs.length) / kk);
    const end = Math.floor(((idx + 1) * entityIdxs.length) / kk);
    const members = entityIdxs.slice(start, end);
    const child = new ClusterNode(
      ClusterId(`${cluster.id}:bucket:${idx}`),
      "entity-bucket",
      { source: "direct", members },
    );
    child.count = end - start;
    child.label = new ClusterLabel(`Group ${idx + 1}`);
    children.push(child);
  }
  return children;
}

/**
 * Sub-cluster a single cluster into child nodes.
 *
 * Returns an empty array if the cluster is small enough to show entities
 * directly, otherwise >= 2 children. When `entityIdxs.length` exceeds
 * `config.communityWorkerNodeCap`, skips full CSR community detection
 * and buckets members by coarse link signature instead. Otherwise runs
 * community detection and falls back to {@link deterministicPartition}
 * when there are no internal edges or fewer than two normalized
 * communities.
 */
export function subclusterByLinks(
  cluster: ClusterNode,
  entityIdxs: Column<Int32Array, EntityIndex>,
  links: LinkStore,
  config: VizConfig,
): ClusterNode[] {
  if (entityIdxs.length <= config.entityRevealMax) {
    return [];
  }

  // Above the worker node cap, skip O(E) CSR community detection; bucket
  // by link signature instead (faster, coarser groups).
  if (entityIdxs.length > config.communityWorkerNodeCap) {
    return coarseLinkSignatureBuckets(cluster, entityIdxs, links, config);
  }

  const csr = buildInducedCsr(entityIdxs, links);

  // Isolated or externally-only subgraph: label propagation has no
  // signal, so partition deterministically.
  if (csr.neighbors.length === 0) {
    return deterministicPartition(cluster, entityIdxs, config);
  }

  const components = connectedComponents(csr);
  const rawCommunities: number[][] = [];

  for (const component of components) {
    if (component.length <= config.communityMaxSize) {
      rawCommunities.push(component);
      continue;
    }

    const labels = boundedLabelPropagation(csr, component);
    const split = labelsToCommunities(labels, component);
    for (const community of split) {
      rawCommunities.push(community);
    }
  }

  const normalized = normalizeCommunitySizes(rawCommunities, csr, config);

  // A single mega-community after normalization still hides structure;
  // fall back to equal chunks for drill-in.
  if (normalized.length < 2) {
    return deterministicPartition(cluster, entityIdxs, config);
  }

  const children: ClusterNode[] = normalized.map((memberIdxs, idx) => {
    const members = columnFromIndices(memberIdxs);
    const child = new ClusterNode(
      ClusterId(`${cluster.id}:community:${idx}`),
      "community",
      { source: "direct", members },
    );
    child.count = memberIdxs.length;
    child.label = new ClusterLabel(`Community ${idx + 1}`);
    return child;
  });

  labelAllCommunities(normalized, children, links);

  return children;
}
