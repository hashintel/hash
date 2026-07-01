/** Deterministic synthetic-graph builders for benchmarks. */
import { entityIdFromComponents } from "@blockprotocol/type-system";

import { EntityIndex, TypeSetId } from "../ids";
import { mulberry32 } from "../math/random";
import { Column } from "./collections/column";
import { radiusForDegree } from "./entity-style";
import { LinkStore } from "./store/link";

import type { ForceEdge, ForceNode } from "./layout/force-simulation";
import type { IngestEntity, TypeSchemaEntry } from "./protocol";
import type {
  EntityId,
  EntityUuid,
  LinkData,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";

const WEB_ID = "11111111-1111-4111-8111-111111111111" as WebId;

/** EntityId for the given index. Node and link ids share the index space. */
export function benchEntityId(index: number): EntityId {
  const uuid =
    `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}` as EntityUuid;
  return entityIdFromComponents(WEB_ID, uuid);
}

export function benchNodeTypeUrl(typeIndex: number): VersionedUrl {
  return `https://example.com/types/entity-type/bench-node-${typeIndex}/v/1` as VersionedUrl;
}

export const BENCH_LINK_TYPE_URL =
  "https://example.com/types/entity-type/bench-link/v/1" as VersionedUrl;

/** Knobs shaping a synthetic graph. `linkCount` links point mostly at the first `hubCount` nodes. */
export interface GraphShape {
  readonly nodeCount: number;
  readonly linkCount: number;
  /** Distinct node entity types (each node is assigned one). */
  readonly typeCount: number;
  /** High-degree hubs that most links point into (skews the degree distribution, like real data). */
  readonly hubCount: number;
  /** Fraction [0,1] of nodes that are query roots; the rest are frontier nodes. */
  readonly rootFraction: number;
  readonly seed: number;
}

/** Type schemas for `typeCount` flat (parentless) node types plus the one link type. */
export function benchTypeSchemas(typeCount: number): TypeSchemaEntry[] {
  const schemas: TypeSchemaEntry[] = [];
  for (let typeIndex = 0; typeIndex < typeCount; typeIndex++) {
    schemas.push({
      url: benchNodeTypeUrl(typeIndex),
      title: `Bench Node ${typeIndex}`,
      allOfRefs: [],
    });
  }
  schemas.push({
    url: BENCH_LINK_TYPE_URL,
    title: "Bench Link",
    inverseTitle: "Bench Link Of",
    allOfRefs: [],
  });
  return schemas;
}

/** Pick a link target with a hub bias: ~70% of links point at one of the first `hubCount` nodes. */
function pickTarget(
  random: () => number,
  nodeCount: number,
  hubCount: number,
): number {
  if (hubCount > 0 && random() < 0.7) {
    return Math.floor(random() * hubCount) % nodeCount;
  }
  return Math.floor(random() * nodeCount);
}

/**
 * `nodeCount` node entities followed by `linkCount` link entities
 * with hub-biased endpoints.
 */
export function buildIngestEntities(shape: GraphShape): IngestEntity[] {
  const { nodeCount, linkCount, typeCount, hubCount, rootFraction, seed } =
    shape;
  const random = mulberry32(seed);
  const entities: IngestEntity[] = [];
  const rootCutoff = Math.round(nodeCount * rootFraction);

  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const typeIndex = Math.floor(random() * Math.max(1, typeCount));
    entities.push({
      entityId: benchEntityId(nodeIndex),
      entityTypeIds: [benchNodeTypeUrl(typeIndex)],
      isLink: false,
      isRoot: nodeIndex < rootCutoff,
    });
  }

  for (let linkIndex = 0; linkIndex < linkCount; linkIndex++) {
    const left = Math.floor(random() * nodeCount);
    let right = pickTarget(random, nodeCount, hubCount);
    if (right === left) {
      right = (right + 1) % nodeCount;
    }
    const linkData = {
      leftEntityId: benchEntityId(left),
      rightEntityId: benchEntityId(right),
    } as LinkData;
    entities.push({
      entityId: benchEntityId(nodeCount + linkIndex),
      entityTypeIds: [BENCH_LINK_TYPE_URL],
      isLink: true,
      isRoot: false,
      linkData,
    });
  }

  return entities;
}

/** Undirected edge index pairs (local indices `[0, nodeCount)`), hub-biased, deduplicated. */
function buildEdgePairs(shape: GraphShape): [number, number][] {
  const { nodeCount, linkCount, hubCount, seed } = shape;
  // Offset the seed so edge pairs draw a different stream than buildIngestEntities.
  const random = mulberry32(seed + 0x9e3779b9);
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  for (let linkIndex = 0; linkIndex < linkCount; linkIndex++) {
    const left = Math.floor(random() * nodeCount);
    let right = pickTarget(random, nodeCount, hubCount);
    if (right === left) {
      right = (right + 1) % nodeCount;
    }
    const lo = Math.min(left, right);
    const hi = Math.max(left, right);
    const key = lo * nodeCount + hi;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    pairs.push([lo, hi]);
  }
  return pairs;
}

/**
 * Force-layout graph. Radii scale with degree, start positions are spread
 * via golden-angle so nodes are not stacked on the origin.
 */
export function buildForceGraph(shape: GraphShape): {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
} {
  const pairs = buildEdgePairs(shape);
  const degree = new Int32Array(shape.nodeCount);
  for (const [left, right] of pairs) {
    degree[left]! += 1;
    degree[right]! += 1;
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nodes: ForceNode[] = [];
  for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
    const distance = 20 * Math.sqrt(nodeIndex + 1);
    const angle = nodeIndex * goldenAngle;
    nodes.push({
      id: String(nodeIndex),
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: radiusForDegree(degree[nodeIndex]!),
    });
  }

  const edges: ForceEdge[] = pairs.map(([left, right]) => ({
    source: String(left),
    target: String(right),
    weight: 1,
  }));

  return { nodes, edges };
}

/** Link store and entity index column. Entity indices are the contiguous range `[0, nodeCount)`. */
export function buildCommunityInputs(shape: GraphShape): {
  readonly entityIdxs: Column<Int32Array, EntityIndex>;
  readonly links: LinkStore;
} {
  const entityIdxs = new Column<Int32Array, EntityIndex>(
    Int32Array,
    Math.max(1, shape.nodeCount),
  );
  for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
    entityIdxs.push(EntityIndex(nodeIndex));
  }

  const links = new LinkStore();
  const pairs = buildEdgePairs(shape);
  const linkTypeIdx = TypeSetId(0);
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
    const [left, right] = pairs[pairIndex]!;
    links.insert(
      EntityIndex(left),
      EntityIndex(right),
      linkTypeIdx,
      EntityIndex(shape.nodeCount + pairIndex),
    );
  }

  return { entityIdxs, links };
}
