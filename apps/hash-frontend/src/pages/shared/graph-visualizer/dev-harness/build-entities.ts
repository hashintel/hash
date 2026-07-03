/**
 * Build the synthetic {@link HashEntity} set: normal entities (one per kind, with a populated label
 * property so `generateEntityLabel` resolves a name) plus link entities connecting them with a
 * hub-skewed degree distribution, so a few high-degree hubs emerge and the hub-label feature is
 * exercised.
 *
 * Entities are constructed by mirroring the Graph-API plain-object shape (recordId.entityId in
 * `webId~entityUuid` form, non-empty entityTypeIds, provenance, temporalVersioning, per-property
 * `metadata.dataTypeId`) and wrapping it in `new HashEntity(...)`.
 */
import { HashEntity } from "@local/hash-graph-sdk/entity";

import { mulberry32 } from "../math/random";

import type { FixtureEntityKind } from "./build-type-maps";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";

const WEB_ID = "00000000-0000-0000-0000-000000000001";

const TEXT_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";

const LINK_LABEL_BASE_URL =
  "https://hash.ai/@dev/types/property-type/relationship-label/" as BaseUrl;

const FIXED_TIMESTAMP = "2024-01-01T00:00:00Z";
const ACTOR_ID = "4ed14962-7132-4453-8fc5-39b5c2131d45";

/** Inputs for {@link buildEntities}. */
export interface BuildEntitiesParams {
  readonly entityCount: number;
  readonly kinds: readonly FixtureEntityKind[];
  readonly linkTypeId: VersionedUrl;
  /** Average links emitted per node; total links is roughly `entityCount * linkDensity`. */
  readonly linkDensity: number;
  /** Count of high-degree hub nodes that many other nodes link into. */
  readonly hubCount: number;
  readonly seed: number;
}

/** The built entity set plus the ordered ids, so the harness can stream and pick roots in order. */
export interface EntityFixture {
  readonly entities: HashEntity[];
  readonly nodeEntityIds: readonly EntityId[];
}

/** A 16-hex-digit segment of a deterministic, fixture-shaped UUID. */
function hexSegment(rng: () => number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index++) {
    out += Math.floor(rng() * 16).toString(16);
  }
  return out;
}

function makeUuid(rng: () => number): string {
  return [
    hexSegment(rng, 8),
    hexSegment(rng, 4),
    hexSegment(rng, 4),
    hexSegment(rng, 4),
    hexSegment(rng, 12),
  ].join("-");
}

function makeEntityId(rng: () => number): EntityId {
  // Fixture ids use the Graph API webId~uuid shape expected by EntityId.
  return `${WEB_ID}~${makeUuid(rng)}` as EntityId;
}

/** Provenance block shared by every synthetic entity. */
function provenance(): GraphApiEntity["metadata"]["provenance"] {
  return {
    createdById: ACTOR_ID,
    createdAtDecisionTime: FIXED_TIMESTAMP,
    createdAtTransactionTime: FIXED_TIMESTAMP,
    firstNonDraftCreatedAtDecisionTime: FIXED_TIMESTAMP,
    firstNonDraftCreatedAtTransactionTime: FIXED_TIMESTAMP,
    edition: {
      createdById: ACTOR_ID,
      actorType: "machine",
      origin: { type: "api" },
    },
  };
}

/** Temporal versioning block (decision + transaction time, both unbounded) shared by every entity. */
function temporalVersioning(): GraphApiEntity["metadata"]["temporalVersioning"] {
  const interval = {
    start: { kind: "inclusive" as const, limit: FIXED_TIMESTAMP },
    end: { kind: "unbounded" as const },
  };
  return { decisionTime: interval, transactionTime: interval };
}

/**
 * A single text property's flat value plus the matching nested metadata entry (carrying the
 * dataTypeId), so the entity exposes both `entity.properties[baseUrl]` (read by the label path) and
 * the per-property `metadata`.
 */
function textProperty(baseUrl: BaseUrl, value: string) {
  return {
    flat: { [baseUrl]: value },
    metadata: {
      [baseUrl]: {
        metadata: { dataTypeId: TEXT_DATA_TYPE_ID },
      },
    },
  };
}

function buildNode(params: {
  readonly entityId: EntityId;
  readonly editionId: string;
  readonly kind: FixtureEntityKind;
  readonly label: string;
}): GraphApiEntity {
  const name = textProperty(params.kind.labelPropertyBaseUrl, params.label);
  const description = textProperty(
    params.kind.secondaryPropertyBaseUrl,
    `A synthetic ${params.kind.name.toLowerCase()} for the dev harness.`,
  );

  return {
    metadata: {
      archived: false,
      entityTypeIds: [params.kind.typeId],
      provenance: provenance(),
      temporalVersioning: temporalVersioning(),
      recordId: { editionId: params.editionId, entityId: params.entityId },
      properties: { value: { ...name.metadata, ...description.metadata } },
    },
    properties: { ...name.flat, ...description.flat },
  };
}

function buildLink(params: {
  readonly entityId: EntityId;
  readonly editionId: string;
  readonly linkTypeId: VersionedUrl;
  readonly leftEntityId: EntityId;
  readonly rightEntityId: EntityId;
  readonly label: string;
}): GraphApiEntity {
  const labelProperty = textProperty(LINK_LABEL_BASE_URL, params.label);

  return {
    metadata: {
      archived: false,
      entityTypeIds: [params.linkTypeId],
      provenance: provenance(),
      temporalVersioning: temporalVersioning(),
      recordId: { editionId: params.editionId, entityId: params.entityId },
      properties: { value: { ...labelProperty.metadata } },
    },
    properties: { ...labelProperty.flat },
    linkData: {
      leftEntityId: params.leftEntityId,
      rightEntityId: params.rightEntityId,
    },
  };
}

/**
 * Pick a link target index with a hub bias: most targets are drawn from the first `hubCount` nodes,
 * the rest uniformly. This concentrates incoming links on a few hubs so the 95th-percentile hub
 * detection promotes them.
 */
function pickTarget(
  rng: () => number,
  nodeCount: number,
  hubCount: number,
): number {
  const effectiveHubs = Math.min(hubCount, nodeCount);
  if (effectiveHubs > 0 && rng() < 0.7) {
    return Math.floor(rng() * effectiveHubs);
  }
  return Math.floor(rng() * nodeCount);
}

export function buildEntities(params: BuildEntitiesParams): EntityFixture {
  const rng = mulberry32(params.seed);
  const nodeCount = Math.max(1, params.entityCount);

  const nodes: GraphApiEntity[] = [];
  const nodeIds: EntityId[] = [];
  const perKindCounter = new Map<VersionedUrl, number>();

  for (let index = 0; index < nodeCount; index++) {
    // kinds is non-empty (buildTypeMaps clamps kindCount >= 1).
    const kind = params.kinds[index % params.kinds.length]!;
    const ordinal = (perKindCounter.get(kind.typeId) ?? 0) + 1;
    perKindCounter.set(kind.typeId, ordinal);

    const entityId = makeEntityId(rng);
    nodeIds.push(entityId);
    nodes.push(
      buildNode({
        entityId,
        editionId: makeUuid(rng),
        kind,
        label: `${kind.name} ${ordinal}`,
      }),
    );
  }

  const links: GraphApiEntity[] = [];
  const targetLinkCount = Math.round(
    nodeCount * Math.max(0, params.linkDensity),
  );

  for (let index = 0; index < targetLinkCount; index++) {
    const sourceIndex = Math.floor(rng() * nodeCount);
    let targetIndex = pickTarget(rng, nodeCount, params.hubCount);
    if (targetIndex === sourceIndex) {
      targetIndex = (targetIndex + 1) % nodeCount;
    }

    links.push(
      buildLink({
        entityId: makeEntityId(rng),
        editionId: makeUuid(rng),
        linkTypeId: params.linkTypeId,
        // sourceIndex and targetIndex are drawn from [0, nodeCount) and nodeIds has
        // length nodeCount.
        leftEntityId: nodeIds[sourceIndex]!,
        rightEntityId: nodeIds[targetIndex]!,
        label: "related to",
      }),
    );
  }

  const entities = [...nodes, ...links].map((plain) => new HashEntity(plain));

  return { entities, nodeEntityIds: nodeIds };
}
