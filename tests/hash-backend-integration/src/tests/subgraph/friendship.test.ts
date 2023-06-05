import path from "node:path";

import {
  currentTimeInstantTemporalAxes,
  fullDecisionTimeAxis,
  ImpureGraphContext,
  zeroedGraphResolveDepths,
} from "@apps/hash-api/src/graph";
import { getEntities } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { getDataTypes } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import {
  getEntityTypeById,
  getEntityTypes,
} from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { getPropertyTypes } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { EntityStructuralQuery } from "@local/hash-graph-client";
import {
  BaseUrl,
  Entity,
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
  OntologyTypeVertexId,
  QueryTemporalAxesUnresolved,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getEntityTypes as getEntityTypesFromSubgraph,
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import { resetGraph, restoreSnapshot } from "../test-server";
import { createTestImpureGraphContext } from "../util";

jest.setTimeout(60000);

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

const aliceFilter: EntityStructuralQuery["filter"] = {
  startsWith: [
    {
      path: ["properties", nameProperty],
    },
    {
      parameter: "Alice",
    },
  ],
};

const bobFilter: EntityStructuralQuery["filter"] = {
  startsWith: [
    {
      path: ["properties", nameProperty],
    },
    {
      parameter: "Bob",
    },
  ],
};

const friendshipFilter: EntityStructuralQuery["filter"] = {
  startsWith: [
    {
      path: ["type", "baseUrl"],
    },
    {
      parameter: friendshipTypeBaseId,
    },
  ],
};

const linkFilter: EntityStructuralQuery["filter"] = {
  startsWith: [
    {
      path: ["type", "inheritsFrom", "*", "versionedUrl"],
    },
    {
      parameter: linkEntityTypeUrl,
    },
  ],
};

let graphContext: ImpureGraphContext;

let friendshipEntityType: EntityTypeWithMetadata;

let aliceEntities: Entity[];
let bobEntities: Entity[];
let linkEntities: Entity[];

beforeAll(async () => {
  await restoreSnapshot(path.join(__dirname, "pass", "friendship.jsonl"));

  graphContext = createTestImpureGraphContext();

  friendshipEntityType = await getEntityTypeById(graphContext, {
    entityTypeId: `${friendshipTypeBaseId}v/1`,
  });

  aliceEntities = await getEntities(graphContext, {
    query: {
      filter: aliceFilter,
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: fullDecisionTimeAxis,
    },
  })
    .then(getRoots)
    .then((entities) =>
      entities.sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      ),
    );

  bobEntities = await getEntities(graphContext, {
    query: {
      filter: bobFilter,
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: fullDecisionTimeAxis,
    },
  })
    .then(getRoots)
    .then((entities) =>
      entities.sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      ),
    );

  linkEntities = await getEntities(graphContext, {
    query: {
      filter: linkFilter,
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: fullDecisionTimeAxis,
    },
  })
    .then(getRoots)
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
  it("read data types", async () => {
    const subgraph = await getDataTypes(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 1 },
        },
        temporalAxes: fullDecisionTimeAxis,
      },
    });
    expect(subgraph.roots.length).toEqual(3);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const data_types = getRoots(subgraph);

    expect(data_types.length).toBe(3);
  });

  it("read property types", async () => {
    const subgraph = await getPropertyTypes(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 1 },
        },
        temporalAxes: fullDecisionTimeAxis,
      },
    });
    expect(subgraph.roots.length).toEqual(2);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const property_types = getRoots(subgraph);

    expect(property_types.length).toBe(2);
  });

  it("read entity types", async () => {
    const subgraph = await getEntityTypes(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 1 },
        },
        temporalAxes: fullDecisionTimeAxis,
      },
    });
    expect(subgraph.roots.length).toEqual(4);
    expect(Object.keys(subgraph.edges).length).toEqual(1);
    const entity_types = getRoots(subgraph);

    expect(entity_types.length).toBe(4);
  });
});

describe("Simple queries", () => {
  it("read all entities", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: fullDecisionTimeAxis,
      },
    });
    expect(subgraph.roots.length).toEqual(5);
    expect(Object.keys(subgraph.vertices).length).toEqual(3);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(5);
  });

  it("read entities at 2000-01-01 as of now", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2000-01-01T00:00Z" as Timestamp,
          null,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of now", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          null,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2001-01-01 as of 2001-01-01", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of 2001-01-20", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-20T00:00Z" as Timestamp,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2002-01-01 as of 2001-01-01", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2002-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(0);
    expect(Object.keys(subgraph.vertices).length).toEqual(0);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2002-02-01 as of now", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-02-01T00:00Z" as Timestamp,
          null,
        ),
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
    expect(entities[0]!.metadata.recordId.editionId).toBe(
      "00000001-0001-0000-0000-000000000002",
    );
    expect(entities[0]!.properties[nameProperty]).toBe("Alice Allison");
  });

  it("read latest alice entity", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: aliceFilter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities.length).toBe(1);
    expect(entities[0]).toStrictEqual(aliceEntities[aliceEntities.length - 1]);
  });

  it("read latest friendship entity", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: friendshipFilter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(1);
    expect(Object.keys(subgraph.edges).length).toEqual(0);
    const entities = getRoots(subgraph);

    expect(entities).toStrictEqual(linkEntities);
  });
});

describe("non-zero, simple resolve depths", () => {
  it("read persons based on the friendship (as of now)", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: friendshipFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: {
            incoming: 0,
            outgoing: 1,
          },
          hasRightEntity: {
            incoming: 0,
            outgoing: 1,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(3);
    expect(Object.keys(subgraph.edges).length).toEqual(1);

    const friendshipEntity = getRoots(subgraph)[0]!;
    expect(friendshipEntity).toStrictEqual(linkEntities[0]);
    expect(
      Object.keys(subgraph.edges[friendshipEntity.metadata.recordId.entityId]!)
        .length,
    ).toEqual(1);
    expect(
      Object.keys(
        subgraph.edges[friendshipEntity.metadata.recordId.entityId]![
          friendshipEntity.metadata.temporalVersioning.decisionTime.start.limit
        ]!,
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
    expect(rightEntities).toStrictEqual([bobEntities[bobEntities.length - 1]]);
  });

  it("read persons based on the friendship (all time)", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: friendshipFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: {
            incoming: 0,
            outgoing: 1,
          },
          hasRightEntity: {
            incoming: 0,
            outgoing: 1,
          },
        },
        temporalAxes: fullDecisionTimeAxis,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(3);
    expect(Object.keys(subgraph.edges).length).toEqual(1);

    const friendshipEntity = getRoots(subgraph)[0]!;
    expect(friendshipEntity).toStrictEqual(linkEntities[0]);
    expect(
      Object.keys(subgraph.edges[friendshipEntity.metadata.recordId.entityId]!)
        .length,
    ).toEqual(1);
    expect(
      Object.keys(
        subgraph.edges[friendshipEntity.metadata.recordId.entityId]![
          friendshipEntity.metadata.temporalVersioning.decisionTime.start.limit
        ]!,
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
    expect(rightEntitiesNow).toStrictEqual([
      bobEntities[bobEntities.length - 1],
    ]);

    const rightEntitiesUnbounded = getRightEntityForLinkEntity(
      subgraph,
      friendshipEntity.metadata.recordId.entityId,
      { start: { kind: "unbounded" }, end: { kind: "unbounded" } },
    );
    expect(rightEntitiesUnbounded).toStrictEqual(bobEntities);

    // Link was inserted before Bob was updated, so there are multiple Bobs
    // in the subgraph.
    expect(rightEntitiesUnbounded).not.toStrictEqual(rightEntitiesNow);
  });

  it("read friendship type based on the friendship", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: friendshipFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          isOfType: {
            outgoing: 1,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
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
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: aliceFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: {
            incoming: 1,
            outgoing: 0,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
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
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: bobFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: {
            incoming: 1,
            outgoing: 0,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
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
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: aliceFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: {
            incoming: 1,
            outgoing: 0,
          },
          hasRightEntity: {
            incoming: 0,
            outgoing: 1,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(3);
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
        rightEntity: [bobEntities[bobEntities.length - 1]!],
      },
    ]);
  });
});

describe("complex resolve depths", () => {
  it("read persons based on the friendship (as of now)", async () => {
    const subgraph = await getEntities(graphContext, {
      query: {
        filter: aliceFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: {
            incoming: 1,
            outgoing: 0,
          },
          isOfType: {
            outgoing: 1,
          },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    });
    expect(subgraph.roots.length).toEqual(1);
    expect(Object.keys(subgraph.vertices).length).toEqual(4);
    expect(Object.keys(subgraph.edges).length).toEqual(2);
    const roots = getRoots(subgraph);

    const aliceEntity = roots[0]!;
    expect(aliceEntity).toStrictEqual(aliceEntities[aliceEntities.length - 1]);

    const personTypes = subgraph.edges[aliceEntity.metadata.recordId.entityId]![
      aliceEntity.metadata.temporalVersioning.decisionTime.start.limit
    ]!.filter((edge) => edge.kind === "IS_OF_TYPE").map(
      (edge) => edge.rightEndpoint as OntologyTypeVertexId,
    );
    expect(personTypes.length).toEqual(1);
    const personType = personTypes[0]!;

    expect(
      subgraph.vertices[personType.baseId]![personType.revisionId]!.inner
        .metadata.recordId.baseUrl,
    ).toStrictEqual(personTypeBaseId);

    const links = getOutgoingLinksForEntity(
      subgraph,
      aliceEntity.metadata.recordId.entityId,
    );
    expect(links.length).toEqual(1);
    const link = links[0]!;

    const linkTypes = subgraph.edges[link.metadata.recordId.entityId]![
      link.metadata.temporalVersioning.decisionTime.start.limit
    ]!.filter((edge) => edge.kind === "IS_OF_TYPE").map(
      (edge) => edge.rightEndpoint as OntologyTypeVertexId,
    );
    expect(linkTypes.length).toEqual(1);
    const linkType = linkTypes[0]!;

    expect(
      subgraph.vertices[linkType.baseId]![linkType.revisionId]!.inner.metadata
        .recordId.baseUrl,
    ).toStrictEqual(friendshipTypeBaseId);
  });
});
