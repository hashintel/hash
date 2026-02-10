import path from "node:path";

import type { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import {
  archiveDataType,
  unarchiveDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import {
  archiveEntityType,
  unarchiveEntityType,
} from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import {
  archivePropertyType,
  unarchivePropertyType,
} from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import type {
  KnowledgeGraphRootedEdges,
  OntologyVertices,
} from "@blockprotocol/graph";
import {
  getEntityTypes as getEntityTypesFromSubgraph,
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  Entity,
  EntityTypeWithMetadata,
  Timestamp,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveField } from "@local/advanced-types/distribute";
import type {
  QueryEntitySubgraphRequest,
  QueryTemporalAxesUnresolved,
} from "@local/hash-graph-client";
import {
  queryDataTypes,
  type QueryDataTypesParams,
  queryDataTypeSubgraph,
} from "@local/hash-graph-sdk/data-type";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import {
  getEntityTypeById,
  queryEntityTypes,
  type QueryEntityTypesParams,
  queryEntityTypeSubgraph,
} from "@local/hash-graph-sdk/entity-type";
import {
  queryPropertyTypes,
  type QueryPropertyTypesParams,
  queryPropertyTypeSubgraph,
} from "@local/hash-graph-sdk/property-type";
import {
  currentTimeInstantTemporalAxes,
  fullDecisionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph, restoreSnapshot } from "../test-server";
import { createTestImpureGraphContext } from "../util";

export const temporalAxesForTimestamp = (
  decisionTime: Timestamp | null,
  transactionTime: Timestamp | null,
): QueryTemporalAxesUnresolved => {
  return {
    pinned: {
      axis: "transactionTime",
      timestamp: transactionTime,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: decisionTime
          ? {
              kind: "inclusive",
              limit: decisionTime,
            }
          : null,
        end: decisionTime
          ? {
              kind: "inclusive",
              limit: decisionTime,
            }
          : null,
      },
    },
  };
};

const nameProperty =
  "http://localhost:3000/@alice/types/property-type/name/" as BaseUrl;
const personTypeBaseId =
  "http://localhost:3000/@alice/types/entity-type/person/" as BaseUrl;
const friendshipTypeBaseId =
  "http://localhost:3000/@alice/types/entity-type/friendship/" as BaseUrl;

const aliceFilter: DistributiveField<QueryEntitySubgraphRequest, "filter"> = {
  startsWith: [
    {
      path: ["properties", nameProperty],
    },
    {
      parameter: "Alice",
    },
  ],
};

const bobFilter: DistributiveField<QueryEntitySubgraphRequest, "filter"> = {
  startsWith: [
    {
      path: ["properties", nameProperty],
    },
    {
      parameter: "Bob",
    },
  ],
};

const friendshipFilter: DistributiveField<
  QueryEntitySubgraphRequest,
  "filter"
> = {
  startsWith: [
    {
      path: ["type", "baseUrl"],
    },
    {
      parameter: friendshipTypeBaseId,
    },
  ],
};

const linkFilter: DistributiveField<QueryEntitySubgraphRequest, "filter"> = {
  startsWith: [
    {
      path: ["type", "inheritsFrom", "*", "versionedUrl"],
    },
    {
      parameter: blockProtocolEntityTypes.link.entityTypeId,
    },
  ],
};

let graphContext: ImpureGraphContext;

let friendshipEntityType: EntityTypeWithMetadata;

let aliceEntities: Entity[];
let bobEntities: Entity[];
let linkEntities: Entity[];

const authentication = {
  actorId: "00000000-0001-8000-8000-000000000000" as ActorEntityUuid,
};

beforeAll(async () => {
  await resetGraph();
  await restoreSnapshot(path.join(__dirname, "pass", "friendship.jsonl"));

  graphContext = createTestImpureGraphContext();

  friendshipEntityType = await getEntityTypeById(
    graphContext.graphApi,
    authentication,
    {
      entityTypeId: `${friendshipTypeBaseId}v/1`,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  ).then((entityType) => {
    if (!entityType) {
      throw new Error("Failed to retrieve friendship entity type");
    }
    return entityType;
  });

  aliceEntities = await queryEntitySubgraph(graphContext, authentication, {
    filter: aliceFilter,
    temporalAxes: fullDecisionTimeAxis,
    traversalPaths: [],
    includeDrafts: false,
    includePermissions: false,
  })
    .then(({ subgraph }) => getRoots(subgraph))
    .then((entities) =>
      entities.sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      ),
    );

  bobEntities = await queryEntitySubgraph(graphContext, authentication, {
    filter: bobFilter,
    temporalAxes: fullDecisionTimeAxis,
    traversalPaths: [],
    includeDrafts: false,
    includePermissions: false,
  })
    .then(({ subgraph }) => getRoots(subgraph))
    .then((entities) =>
      entities.sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      ),
    );

  linkEntities = await queryEntitySubgraph(graphContext, authentication, {
    filter: linkFilter,
    temporalAxes: fullDecisionTimeAxis,
    traversalPaths: [],
    includeDrafts: false,
    includePermissions: false,
  })
    .then(({ subgraph }) => getRoots(subgraph))
    .then((entities) =>
      entities.sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      ),
    );
});

afterAll(async () => {
  await resetGraph();
});

describe("Ontology queries", () => {
  it.each([
    {},
    {
      inheritsFrom: 1,
    },
    {
      inheritsFrom: 255,
    },
  ])("read data types %#", async (resolve_depths) => {
    const { subgraph } = await queryDataTypeSubgraph(
      graphContext.graphApi,
      authentication,
      {
        filter: {
          all: [],
        },
        graphResolveDepths: resolve_depths,
        traversalPaths: [],
        temporalAxes: fullDecisionTimeAxis,
      },
    );
    expect(subgraph.roots.length).toEqual(6);
    expect(Object.keys(subgraph.edges).length).toEqual(0);

    expect(
      getRoots(subgraph)
        .map(({ schema }) => schema.$id)
        .sort(),
    ).toStrictEqual([
      "http://localhost:3000/@alice/types/data-type/number/v/1",
      "http://localhost:3000/@alice/types/data-type/text/v/1",
      "http://localhost:3000/@alice/types/data-type/text/v/2",
      "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
    ]);
  });

  it("archives/unarchives data types", async () => {
    const dataTypeId: VersionedUrl =
      "http://localhost:3000/@alice/types/data-type/number/v/1";

    const request: QueryDataTypesParams = {
      filter: {
        equal: [
          {
            path: ["versionedUrl"],
          },
          {
            parameter: dataTypeId,
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    };

    const { dataTypes: initialDataTypes } = await queryDataTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(initialDataTypes.length).toEqual(1);

    const actorId =
      initialDataTypes[0]!.metadata.provenance.edition.createdById;

    await archiveDataType(
      graphContext,
      { actorId },
      {
        dataTypeId,
      },
    );

    const { dataTypes: emptyDataTypes } = await queryDataTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(emptyDataTypes.length).toEqual(0);

    await unarchiveDataType(
      graphContext,
      { actorId },
      {
        dataTypeId,
      },
    );

    const { dataTypes: nonEmptyDataTypes } = await queryDataTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(nonEmptyDataTypes.length).toEqual(1);
  });

  it.each([
    {},
    {
      constrainsValuesOn: 1,
      constrainsPropertiesOn: 1,
    },
    {
      constrainsValuesOn: 255,
    },
    {
      constrainsPropertiesOn: 255,
    },
  ])("read property types %#", async (graphResolveDepths) => {
    const { subgraph } = await queryPropertyTypeSubgraph(
      graphContext.graphApi,
      authentication,
      {
        filter: {
          all: [],
        },
        graphResolveDepths,
        traversalPaths: [],
        temporalAxes: fullDecisionTimeAxis,
      },
    );
    expect(subgraph.roots.length).toEqual(2);

    expect(
      getRoots(subgraph)
        .map(({ schema }) => schema.$id)
        .sort(),
    ).toStrictEqual([
      "http://localhost:3000/@alice/types/property-type/name/v/1",
      "http://localhost:3000/@alice/types/property-type/name/v/2",
    ]);
  });

  it("archives/unarchives property types", async () => {
    const propertyTypeId: VersionedUrl =
      "http://localhost:3000/@alice/types/property-type/name/v/1";

    const request: QueryPropertyTypesParams = {
      filter: {
        equal: [
          {
            path: ["versionedUrl"],
          },
          {
            parameter: propertyTypeId,
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    };

    const { propertyTypes: initialPropertyTypes } = await queryPropertyTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(initialPropertyTypes.length).toEqual(1);

    const actorId =
      initialPropertyTypes[0]!.metadata.provenance.edition.createdById;

    await archivePropertyType(
      graphContext,
      { actorId },
      {
        propertyTypeId,
      },
    );

    const { propertyTypes: emptyPropertyTypes } = await queryPropertyTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(emptyPropertyTypes.length).toEqual(0);

    await unarchivePropertyType(
      graphContext,
      { actorId },
      {
        propertyTypeId,
      },
    );

    const { propertyTypes: nonEmptyPropertyTypes } = await queryPropertyTypes(
      graphContext.graphApi,
      authentication,
      request,
    );
    expect(nonEmptyPropertyTypes.length).toEqual(1);
  });

  it.each([
    {},
    {
      inheritsFrom: 1,
      constrainsPropertiesOn: 1,
      constrainsLinksOn: 1,
      constrainsLinkDestinationsOn: 1,
    },
    {
      inheritsFrom: 255,
    },
    {
      constrainsPropertiesOn: 255,
    },
    {
      constrainsLinksOn: 4,
    },
    {
      constrainsLinkDestinationsOn: 4,
    },
  ])("read entity types %#", async (resolve_depths) => {
    const { subgraph } = await queryEntityTypeSubgraph(
      graphContext.graphApi,
      authentication,
      {
        filter: {
          all: [],
        },
        graphResolveDepths: resolve_depths,
        traversalPaths: [],
        temporalAxes: fullDecisionTimeAxis,
      },
    );
    expect(subgraph.roots.length).toEqual(4);

    const entityTypes = getRoots(subgraph);
    expect(entityTypes.map(({ schema }) => schema.$id).sort()).toStrictEqual([
      "http://localhost:3000/@alice/types/entity-type/friendship/v/1",
      "http://localhost:3000/@alice/types/entity-type/person/v/1",
      "http://localhost:3000/@alice/types/entity-type/person/v/2",
      "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
    ]);

    expect(
      entityTypes.find(
        ({ schema }) =>
          schema.$id ===
          "http://localhost:3000/@alice/types/entity-type/person/v/1",
      )!.schema.labelProperty,
    ).toBeUndefined();

    expect(
      entityTypes.find(
        ({ schema }) =>
          schema.$id ===
          "http://localhost:3000/@alice/types/entity-type/person/v/2",
      )!.schema.labelProperty,
    ).toStrictEqual("http://localhost:3000/@alice/types/property-type/name/");
  });
});

it("archives/unarchives entity types", async () => {
  const entityTypeId: VersionedUrl =
    "http://localhost:3000/@alice/types/entity-type/person/v/1";

  const request: QueryEntityTypesParams = {
    filter: {
      equal: [
        {
          path: ["versionedUrl"],
        },
        {
          parameter: entityTypeId,
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  };

  const { entityTypes: initialEntityTypes } = await queryEntityTypes(
    graphContext.graphApi,
    authentication,
    request,
  );
  expect(initialEntityTypes.length).toEqual(1);

  const actorId =
    initialEntityTypes[0]!.metadata.provenance.edition.createdById;

  await archiveEntityType(
    graphContext,
    { actorId },
    {
      entityTypeId,
    },
  );

  const { entityTypes: emptyEntityTypes } = await queryEntityTypes(
    graphContext.graphApi,
    authentication,
    request,
  );
  expect(emptyEntityTypes.length).toEqual(0);

  await unarchiveEntityType(
    graphContext,
    { actorId },
    {
      entityTypeId,
    },
  );

  const { entityTypes: nonEmptyEntityTypes } = await queryEntityTypes(
    graphContext.graphApi,
    authentication,
    request,
  );
  expect(nonEmptyEntityTypes.length).toEqual(1);
});

describe("Simple queries", () => {
  it("read all entities", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: fullDecisionTimeAxis,
        includeDrafts: true,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(5);
    expect(Object.keys(subgraph.vertices).length).toEqual(4);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(5);
  });

  it("read entities at 2000-01-01 as of now", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2000-01-01T00:00Z" as Timestamp,
          null,
        ),
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of now", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          null,
        ),
        includeDrafts: true,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2001-01-01 as of 2001-01-01", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of 2001-01-20", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-20T00:00Z" as Timestamp,
        ),
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2002-01-01 as of 2001-01-01", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2002-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2002-02-01 as of now", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: {
          all: [],
        },
        traversalPaths: [],
        temporalAxes: temporalAxesForTimestamp(
          "2001-02-01T00:00Z" as Timestamp,
          null,
        ),
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
    expect(entities[0]!.metadata.recordId.editionId).toBe(
      "00000001-0001-8000-8000-000000000002",
    );
    expect(entities[0]!.properties[nameProperty]).toBe("Alice Allison");
  });

  it("read latest alice entity", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: aliceFilter,
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
    expect(entities[0]).toStrictEqual(aliceEntities[aliceEntities.length - 1]);
  });

  it("read latest friendship entity", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: friendshipFilter,
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities).toStrictEqual(linkEntities);
  });
});

describe("non-zero, simple resolve depths", () => {
  it("read persons based on the friendship (as of now)", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: friendshipFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "outgoing",
              },
            ],
          },
          {
            edges: [
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    // changed from 3 to 2 because the archived entity is filtered out in getEntities – check expectations after H-349 (proper archival)
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(1);

    const friendshipEntity = getRoots(subgraph)[0]!;
    expect(friendshipEntity).toStrictEqual(linkEntities[0]);
    expect(
      Object.keys(
        subgraph.edges[friendshipEntity.metadata.recordId.entityId] ?? {},
      ).length,
    ).toEqual(1);
    expect(
      Object.keys(
        (subgraph.edges as KnowledgeGraphRootedEdges)[
          friendshipEntity.metadata.recordId.entityId
        ]![
          friendshipEntity.metadata.temporalVersioning.decisionTime.start.limit
        ] ?? {},
      ).length,
    ).toEqual(2);

    const leftEntities = getLeftEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
    );
    expect(leftEntities).toStrictEqual([
      aliceEntities[aliceEntities.length - 1],
    ]);

    const rightEntities = getRightEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
    );
    // right entity is archived so shouldn't exist – check expectations after H-349
    expect(rightEntities).toStrictEqual([]);
  });

  it("read persons based on the friendship (all time)", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: friendshipFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "outgoing",
              },
            ],
          },
          {
            edges: [
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
        ],
        temporalAxes: fullDecisionTimeAxis,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    // changed from 3 to 2 because the archived entity is filtered out in getEntities
    // – this should probably change back to 3 after H-349 when the getEntities hack is removed: this is an 'all time' query
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(1);

    const friendshipEntity = getRoots(subgraph)[0]!;
    expect(friendshipEntity).toStrictEqual(linkEntities[0]);
    expect(
      Object.keys(
        subgraph.edges[friendshipEntity.metadata.recordId.entityId] ?? {},
      ).length,
    ).toEqual(1);

    expect(
      Object.keys(
        (subgraph.edges as KnowledgeGraphRootedEdges)[
          friendshipEntity.metadata.recordId.entityId
        ]![
          friendshipEntity.metadata.temporalVersioning.decisionTime.start.limit
        ] ?? {},
      ).length,
    ).toEqual(2);

    const leftEntitiesNow = getLeftEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
      { start: { kind: "unbounded" }, end: { kind: "unbounded" } },
    );
    const leftEntitiesUnbounded = getLeftEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
      { start: { kind: "unbounded" }, end: { kind: "unbounded" } },
    );

    expect(leftEntitiesNow).toBeDefined();
    expect(leftEntitiesNow![0]).toStrictEqual(
      aliceEntities[aliceEntities.length - 1],
    );

    // Link was inserted after Alice was updated, so there is only one Alice
    // entity in the subgraph.
    expect(leftEntitiesUnbounded).toStrictEqual(leftEntitiesNow);

    const rightEntitiesNow = getRightEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
    );
    // Check expectations after H-349 – bob is archived so this should not show up in a 'now' query
    expect(rightEntitiesNow).toStrictEqual([]);

    // This should probably be restored after H-349, because the archived entity should show up in an unbounded query
    // const rightEntitiesUnbounded = getRightEntityForLinkEntity(
    //   subgraph,
    //   friendshipEntity.metadata.recordId.entityId,
    //   { start: { kind: "unbounded" }, end: { kind: "unbounded" } },
    // );
    // expect(rightEntitiesUnbounded).toStrictEqual(bobEntities);

    // Link was inserted before Bob was updated, so there are multiple Bobs
    // in the subgraph.
    // expect(rightEntitiesUnbounded).not.toStrictEqual(rightEntitiesNow);
  });

  it("read friendship type based on the friendship", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: friendshipFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "is-of-type",
              },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(1);
    const roots = getRoots(subgraph);

    const friendship_entity = roots[0]!;
    expect(friendship_entity).toStrictEqual(linkEntities[0]);

    const entityTypes = getEntityTypesFromSubgraph(subgraph);
    expect(entityTypes).toStrictEqual([friendshipEntityType]);
  });

  it("read friendship from left entity (as of now)", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: aliceFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "incoming",
              },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(1);
    const roots = getRoots(subgraph);

    const aliceEntity = roots[0]!;
    expect(aliceEntity).toStrictEqual(aliceEntities[aliceEntities.length - 1]);

    const links = getOutgoingLinksForEntity(
      subgraph,
      aliceEntity.metadata.recordId.entityId,
    );
    expect(links).toStrictEqual(linkEntities);

    const linksAndTargets = getOutgoingLinkAndTargetEntities(
      subgraph,
      aliceEntity.metadata.recordId.entityId,
    );
    expect(linksAndTargets).toStrictEqual([
      {
        linkEntity: [linkEntities[0]!],
        rightEntity: undefined,
      },
    ]);
  });

  it("read friendship from right entity", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: bobFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-right-entity",
                direction: "incoming",
              },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(1);
    const roots = getRoots(subgraph);

    const bobEntity = roots[0]!;
    expect(bobEntity).toStrictEqual(bobEntities[bobEntities.length - 1]);

    const links = getIncomingLinksForEntity(
      subgraph,
      bobEntity.metadata.recordId.entityId,
    );
    expect(links).toStrictEqual(linkEntities);
  });

  it("read person through a link", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: aliceFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "incoming",
              },
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    // changed from 3 to 2 because the archived entity is filtered out in getEntities – check expectations after H-349 (proper archival)
    expect(Object.keys(subgraph.vertices).length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(2);
    const roots = getRoots(subgraph);

    const aliceEntity = roots[0]!;
    expect(aliceEntity).toStrictEqual(aliceEntities[aliceEntities.length - 1]);

    const linksAndTargets = getOutgoingLinkAndTargetEntities(
      subgraph,
      aliceEntity.metadata.recordId.entityId,
    );
    expect(linksAndTargets).toStrictEqual([
      {
        linkEntity: [linkEntities[0]!],
        // bob is archived so this should be empty – check expectations after H-349
        rightEntity: [],
      },
    ]);
  });
});

describe("complex resolve depths", () => {
  it("read person, include friendship link and their types (as of now)", async () => {
    const { subgraph } = await queryEntitySubgraph(
      graphContext,
      authentication,
      {
        filter: aliceFilter,
        traversalPaths: [
          {
            edges: [
              {
                kind: "has-left-entity",
                direction: "incoming",
              },
            ],
          },
        ],
        graphResolveDepths: {
          isOfType: true,
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(4);
    expect(Object.keys(subgraph.edges).length).toEqual(2);
    const roots = getRoots(subgraph);

    const aliceEntity = roots[0]!;
    expect(aliceEntity).toStrictEqual(aliceEntities[aliceEntities.length - 1]);

    const personTypes = (subgraph.edges as KnowledgeGraphRootedEdges)
      [aliceEntity.metadata.recordId.entityId]![
        aliceEntity.metadata.temporalVersioning.decisionTime.start.limit
      ]!.filter((edge) => edge.kind === "IS_OF_TYPE")
      .map((edge) => edge.rightEndpoint);

    expect(personTypes.length).toEqual(1);
    const personType = personTypes[0]!;

    expect(
      (subgraph.vertices as OntologyVertices)[personType.baseId]![
        personType.revisionId.toString()
      ]!.inner.metadata.recordId.baseUrl,
    ).toStrictEqual(personTypeBaseId);

    const links = getOutgoingLinksForEntity(
      subgraph,
      aliceEntity.metadata.recordId.entityId,
    );
    expect(links.length).toEqual(1);
    const link = links[0]!;

    const linkTypes = (subgraph.edges as KnowledgeGraphRootedEdges)
      [link.metadata.recordId.entityId]![
        link.metadata.temporalVersioning.decisionTime.start.limit
      ]!.filter((edge) => edge.kind === "IS_OF_TYPE")
      .map((edge) => edge.rightEndpoint);

    expect(linkTypes.length).toEqual(1);
    const linkType = linkTypes[0]!;

    expect(
      (subgraph.vertices as OntologyVertices)[linkType.baseId]![
        linkType.revisionId.toString()
      ]!.inner.metadata.recordId.baseUrl,
    ).toStrictEqual(friendshipTypeBaseId);
  });
});
