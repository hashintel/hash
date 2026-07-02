/**
 * Deterministic synthetic-graph generator for the dev harness: from a small set of knobs it builds a
 * valid {@link HashEntity} set plus the ontology maps the visualizer needs, so a developer can
 * iterate on the visualizer without real entities.
 *
 * Reproducible per seed (a seeded PRNG drives every choice), so Regenerate with the same seed yields
 * the same graph.
 */
import { buildEntities } from "./generate-fixture/build-entities";
import { buildTypeMaps } from "./generate-fixture/build-type-maps";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/** Knobs that shape the generated graph. All counts are clamped to sane minimums. */
export interface GenerateFixtureParams {
  /** Number of normal (non-link) entities. */
  readonly entityCount: number;
  /** Number of distinct entity types, clamped to the built-in kind list. */
  readonly entityTypeCount: number;
  /** Average links per node; total link entities is roughly `entityCount * linkDensity`. */
  readonly linkDensity: number;
  /** Fraction (0-1) of nodes treated as query roots; the rest render as frontier nodes. */
  readonly rootFraction: number;
  /** Count of high-degree hub nodes that many others link into. */
  readonly hubCount: number;
  /** Seed for the PRNG; the same seed reproduces the same graph. */
  readonly seed: number;
}

/** The complete set of props the visualizer consumes, ready to spread onto it. */
export interface GraphFixture {
  readonly entities: HashEntity[];
  readonly rootEntityIds: EntityId[];
  readonly closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  readonly definitions: ClosedMultiEntityTypesDefinitions;
}

export function generateGraphFixture(
  params: GenerateFixtureParams,
): GraphFixture {
  const { kinds, linkTypeId, closedMultiEntityTypesRootMap, definitions } =
    buildTypeMaps(params.entityTypeCount);

  const { entities, nodeEntityIds } = buildEntities({
    entityCount: params.entityCount,
    kinds,
    linkTypeId,
    linkDensity: params.linkDensity,
    hubCount: params.hubCount,
    seed: params.seed,
  });

  // Roots are the first `rootFraction` of the node ids; ordering is stable per seed, so streaming
  // can grow the root set alongside the entity stream. Hubs come first, so they are roots early.
  const clampedFraction = Math.min(1, Math.max(0, params.rootFraction));
  const rootCount = Math.round(nodeEntityIds.length * clampedFraction);
  const rootEntityIds = nodeEntityIds.slice(0, rootCount);

  return {
    entities,
    rootEntityIds,
    closedMultiEntityTypesRootMap,
    definitions,
  };
}
