/** Deterministic synthetic-graph builders for benchmarks. */
import { entityIdFromComponents } from "@blockprotocol/type-system";

import { EntityIndex, TypeSetId } from "../ids";
import { mulberry32 } from "../math/random";
import { Column } from "./collections/column";
import { radiusForDegree } from "./entity-style";
import { LinkStore } from "./store/link";

import type { ForceEdge, ForceNode } from "./layout/force-simulation";
import type {
  CapturedLayoutFixture,
  IngestEntity,
  TypeSchemaEntry,
} from "./protocol";
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

/** One near-coincident super-hub to graft onto a cloud: leaf count + hub centre. */
export interface CoincidentHubSpec {
  readonly leaves: number;
  readonly x: number;
  readonly y: number;
}

/**
 * A {@link buildForceGraph} cloud PLUS one or more super-hubs, each with `leaves`
 * degree-1 leaves initialised near-coincident with its hub centre. This reproduces
 * the production pathology that froze the old terminal VPSC projection for seconds:
 * a hub's worth of leaves cannot be pulled apart by the stress phase's soft overlap
 * term (it reaches equilibrium), so a tight near-coincident pile-up reaches the
 * overlap-removal phase. The extra node/edge ids continue the cloud's index space.
 */
export function buildForceGraphWithCoincidentHubs(
  shape: GraphShape,
  hubs: readonly CoincidentHubSpec[],
): {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
} {
  const { nodes, edges } = buildForceGraph(shape);
  const random = mulberry32(shape.seed + 0x5bd1e995);

  let nextIndex = shape.nodeCount;
  for (const hub of hubs) {
    const hubIndex = nextIndex;
    nextIndex += 1 + hub.leaves;

    nodes.push({
      id: String(hubIndex),
      x: hub.x,
      y: hub.y,
      radius: radiusForDegree(hub.leaves),
    });
    for (let leaf = 0; leaf < hub.leaves; leaf++) {
      const leafIndex = hubIndex + 1 + leaf;
      // ~40px from the shared centre, mutually overlapping — the real hub geometry.
      const angle = random() * Math.PI * 2;
      const distance = 40 * random();
      nodes.push({
        id: String(leafIndex),
        x: hub.x + Math.cos(angle) * distance,
        y: hub.y + Math.sin(angle) * distance,
        radius: radiusForDegree(1),
      });
      edges.push({
        source: String(hubIndex),
        target: String(leafIndex),
        weight: 1,
      });
    }
  }

  return { nodes, edges };
}

/** Single-hub convenience over {@link buildForceGraphWithCoincidentHubs} (hub at the origin). */
export function buildForceGraphWithCoincidentHub(
  shape: GraphShape,
  hubLeaves: number,
): {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
} {
  return buildForceGraphWithCoincidentHubs(shape, [
    { leaves: hubLeaves, x: 0, y: 0 },
  ]);
}

/**
 * The user's real graph shape, as a deterministic fixture: a ~700-node sparse
 * background cloud plus TWO ~150-leaf near-coincident super-hubs (~1000 nodes
 * total). This is the primary relayout-motion gate: two dense hubs whose spokes
 * are geometrically infeasible at the plain ideal edge length, embedded in a
 * cloud sparse enough that the hubs dominate the drawing.
 */
export function buildRealShapeFixture(seed = 7_001): {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
} {
  const cloudCount = 700;
  const shape: GraphShape = {
    nodeCount: cloudCount,
    linkCount: Math.round(cloudCount * 1.5),
    typeCount: 1,
    hubCount: 6,
    rootFraction: 1,
    seed,
  };
  // Hub centres sit inside the seeded cloud (radius ~20·√700 ≈ 530), far enough
  // apart that the two piles start as distinct near-coincident clumps.
  return buildForceGraphWithCoincidentHubs(shape, [
    { leaves: 150, x: -220, y: -40 },
    { leaves: 150, x: 240, y: 60 },
  ]);
}

/**
 * Replay a CAPTURE-LIVE-FIXTURE JSON (the dev harness's "Capture layout fixture"
 * button → {@link CapturedLayoutFixture}) as a layout fixture: real node ids,
 * radii, and LIVE positions (so warm-relayout scenarios replay from the captured
 * geometry; pass `scrambleSeed` to test cold layout from a deterministic
 * phyllotaxis scatter instead). The captured Louvain labels ride along for
 * metrics that want the partition the user was looking at.
 *
 * Usage: save the downloaded JSON under e.g. `worker/fixtures/` and
 * `import fixture from "./fixtures/graph-fixture-1234n-5678e.json"`, or inline
 * `JSON.parse` a console-copied capture, then feed the result to any engine
 * factory exactly like the synthetic builders above.
 */
export function forceGraphFromCapturedFixture(
  fixture: CapturedLayoutFixture,
  options: { readonly scrambleSeed?: number } = {},
): {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
  /** Captured Louvain label per node (parallel to `nodes`; -1 = unassigned). */
  readonly communities: number[];
} {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const scramble =
    options.scrambleSeed === undefined
      ? undefined
      : mulberry32(options.scrambleSeed);
  const nodes: ForceNode[] = fixture.nodes.map((node, index) => {
    if (!scramble) {
      return { id: node.id, x: node.x, y: node.y, radius: node.radius };
    }
    // Deterministic phyllotaxis scatter (the same cold-start shape the synthetic
    // builders use), with the golden-angle sequence jittered by the seed so two
    // scrambles of the same capture differ.
    const distance = 20 * Math.sqrt(index + 1);
    const angle = index * goldenAngle + scramble() * Math.PI * 2;
    return {
      id: node.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: node.radius,
    };
  });
  return {
    nodes,
    edges: fixture.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
    })),
    communities:
      fixture.communities.length === nodes.length
        ? [...fixture.communities]
        : nodes.map(() => -1),
  };
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
