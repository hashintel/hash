import path from "node:path";

import { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { getEntities } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { EntityStructuralQuery } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  AccountId,
  Entity,
  ENTITY_ID_DELIMITER,
  EntityRootType,
  GraphResolveDepths,
  KnowledgeGraphEdgeKind,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntities as getEntitiesSubgraph,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph, restoreSnapshot } from "../test-server";
import { createTestImpureGraphContext } from "../util";

const createQuery = (
  resolveDepths: Partial<GraphResolveDepths> = zeroedGraphResolveDepths,
  timestamp: string = "2010-01-01T00:00:00.000Z",
): EntityStructuralQuery => {
  return {
    filter: {
      equal: [
        {
          path: ["uuid"],
        },
        {
          parameter: "0000000A-0001-0000-0000-000000000000",
        },
      ],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      ...resolveDepths,
    },
    temporalAxes: {
      pinned: {
        axis: "transactionTime",
        timestamp: null,
      },
      variable: {
        axis: "decisionTime",
        interval: {
          start: {
            kind: "inclusive",
            limit: timestamp,
          },
          end: {
            kind: "inclusive",
            limit: timestamp,
          },
        },
      },
    },
    includeDrafts: false,
  };
};
let graphContext: ImpureGraphContext;

let entity_a: Entity;
let entity_b: Entity;
let entity_c: Entity;
let entity_d: Entity;
let link_ab: Entity;
let link_bc: Entity;
let link_cd: Entity;
let link_da: Entity;
let link_ba: Entity;
let link_cb: Entity;
let link_dc: Entity;
let link_ad: Entity;

const authentication = {
  actorId: "00000000-0001-0000-0000-000000000000" as AccountId,
};

beforeAll(async () => {
  await restoreSnapshot(path.join(__dirname, "pass", "circular.jsonl"));

  graphContext = createTestImpureGraphContext();

  const entities = await getEntities(graphContext, authentication, {
    query: {
      filter: {
        all: [],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  }).then(getRoots);

  expect(entities.length).toBe(12);

  const findEntity = (name: string): Entity => {
    return entities.find((entity) => {
      return (
        (entity.metadata.recordId.entityId as string).toLowerCase() ===
        `00000000-0001-0000-0000-000000000000${ENTITY_ID_DELIMITER}${name
          .toLowerCase()
          .padStart(8, "0")}-0001-0000-0000-000000000000`
      );
    })!;
  };

  entity_a = findEntity("A");
  entity_b = findEntity("B");
  entity_c = findEntity("C");
  entity_d = findEntity("D");
  link_ab = findEntity("AB");
  link_bc = findEntity("BC");
  link_cd = findEntity("CD");
  link_da = findEntity("DA");
  link_ba = findEntity("BA");
  link_cb = findEntity("CB");
  link_dc = findEntity("DC");
  link_ad = findEntity("AD");
});

afterAll(async () => {
  await resetGraph();
});

const verticesEquals = (
  subgraph: Subgraph<EntityRootType>,
  entities: Entity[],
): boolean => {
  const vertexIds = getEntitiesSubgraph(subgraph)
    .map((vertex) => vertex.metadata.recordId.entityId)
    .sort();
  const entityIds = entities
    .map((entity) => entity.metadata.recordId.entityId)
    .sort();

  return (
    vertexIds.length === entityIds.length &&
    vertexIds.every((value, index) => value === entityIds[index])
  );
};

const edgesEquals = (
  subgraph: Subgraph<EntityRootType>,
  edges: {
    source: Entity;
    edges: {
      kind: KnowledgeGraphEdgeKind;
      target: Entity;
      direction: "forward" | "backward";
    }[];
  }[],
): boolean => {
  if (Object.values(subgraph.edges).length !== edges.length) {
    return false;
  }

  return edges.every(({ source, edges: outwardEdges }) => {
    const subgraphEdge =
      subgraph.edges[source.metadata.recordId.entityId]![
        source.metadata.temporalVersioning.decisionTime.start.limit
      ]!;

    if (outwardEdges.length !== subgraphEdge.length) {
      return false;
    }

    return outwardEdges.every(({ kind, target, direction }) => {
      return subgraphEdge.some((edge) => {
        return (
          kind === edge.kind &&
          target.metadata.recordId.entityId === edge.rightEndpoint.entityId &&
          ((direction === "forward" && !edge.reversed) ||
            (direction === "backward" && edge.reversed))
        );
      });
    });
  });
};

describe("Single linked list", () => {
  // ┌──────────┐    ┌─────────┐    ┌──────────┐
  // │ Entity A ├───►│ Link AB ├───►│ Entity B │
  // └──────────┘    └─────────┘    └────┬─────┘
  //      ▲                              │
  //      │                              ▼
  // ┌────┴────┐                    ┌─────────┐
  // │ Link DA │                    │ Link BC │
  // └─────────┘                    └────┬────┘
  //      ▲                              │
  //      │                              ▼
  // ┌────┴─────┐     ┌─────────┐   ┌──────────┐
  // │ Entity D │◄────┤ Link CD │◄──┤ Entity C │
  // └──────────┘     └─────────┘   └──────────┘
  it("finds AB", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery(
        {
          hasLeftEntity: {
            incoming: 1,
            outgoing: 0,
          },
        },
        "2002-05-01T00:00:00.000Z",
      ),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(verticesEquals(subgraph, [entity_a, link_ab])).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds AB and travels back", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery(
        {
          hasLeftEntity: {
            incoming: 1,
            outgoing: 1,
          },
        },
        "2002-05-01T00:00:00.000Z",
      ),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(verticesEquals(subgraph, [entity_a, link_ab])).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds B", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery(
        {
          hasLeftEntity: {
            incoming: 1,
            outgoing: 0,
          },
          hasRightEntity: {
            incoming: 0,
            outgoing: 1,
          },
        },
        "2002-05-01T00:00:00.000Z",
      ),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(verticesEquals(subgraph, [entity_a, link_ab, entity_b])).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds B and travels back", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery(
        {
          hasLeftEntity: {
            incoming: 1,
            outgoing: 1,
          },
          hasRightEntity: {
            incoming: 1,
            outgoing: 1,
          },
        },
        "2002-05-01T00:00:00.000Z",
      ),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(
      verticesEquals(subgraph, [
        entity_a,
        link_ab,
        entity_b,
        link_da,
        entity_d,
      ]),
    ).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_d,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_da,
              direction: "backward",
            },
          ],
        },
        {
          source: link_da,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: entity_a,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_da,
              direction: "backward",
            },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: entity_b,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds D", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery(
        {
          hasLeftEntity: {
            incoming: 3,
            outgoing: 0,
          },
          hasRightEntity: {
            incoming: 0,
            outgoing: 3,
          },
        },
        "2002-05-01T00:00:00.000Z",
      ),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(
      verticesEquals(subgraph, [
        entity_a,
        link_ab,
        entity_b,
        link_bc,
        entity_c,
        link_cd,
        entity_d,
      ]),
    ).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: entity_b,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_bc,
              direction: "backward",
            },
          ],
        },
        {
          source: link_bc,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
        {
          source: entity_c,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_cd,
              direction: "backward",
            },
          ],
        },
        {
          source: link_cd,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe("Double linked list", () => {
  //                      ┌─────────┐
  //                 ┌───►│ Link AB ├─────┐
  //                 │    └─────────┘     ▼
  //       ┌─────────┴┐                 ┌──────────┐
  //       │ Entity A │                 │ Entity B │
  //       └──────┬───┘                 └─┬─┬──────┘
  //          ▲   │  ▲    ┌─────────┐     │ │   ▲
  //          │   │  └────┤ Link BA │◄────┘ │   │
  //          │   ▼       └─────────┘       ▼   │
  // ┌────────┴┐ ┌─────────┐       ┌─────────┐ ┌┴────────┐
  // │ Link DA │ │ Link AD │       │ Link BC │ │ Link CB │
  // └─────────┘ └┬────────┘       └────────┬┘ └─────────┘
  //          ▲   │       ┌─────────┐       │   ▲
  //          │   │  ┌────┤ Link CD │◄───┐  │   │
  //          │   ▼  ▼    └─────────┘    │  ▼   │
  //       ┌──┴───────┐                 ┌┴──────┴──┐
  //       │ Entity D │                 │ Entity C │
  //       └────────┬─┘                 └──────────┘
  //                │     ┌─────────┐    ▲
  //                └────►│ Link DC ├────┘
  //                      └─────────┘
  it("finds AB/AD", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery({
        hasLeftEntity: {
          incoming: 1,
          outgoing: 0,
        },
      }),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(verticesEquals(subgraph, [entity_a, link_ab, link_ad])).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
            { kind: "HAS_LEFT_ENTITY", target: link_ad, direction: "backward" },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds AD/DA and travels back", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery({
        hasLeftEntity: {
          incoming: 1,
          outgoing: 1,
        },
      }),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(verticesEquals(subgraph, [entity_a, link_ab, link_ad])).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
            { kind: "HAS_LEFT_ENTITY", target: link_ad, direction: "backward" },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ad,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds B/D", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery({
        hasLeftEntity: {
          incoming: 1,
          outgoing: 0,
        },
        hasRightEntity: {
          incoming: 0,
          outgoing: 1,
        },
      }),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(
      verticesEquals(subgraph, [
        entity_a,
        link_ab,
        entity_b,
        link_ad,
        entity_d,
      ]),
    ).toBe(true);
    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            { kind: "HAS_LEFT_ENTITY", target: link_ab, direction: "backward" },
            { kind: "HAS_LEFT_ENTITY", target: link_ad, direction: "backward" },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ad,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds B/D and travels back", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery({
        hasLeftEntity: {
          incoming: 1,
          outgoing: 1,
        },
        hasRightEntity: {
          incoming: 1,
          outgoing: 1,
        },
      }),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(
      verticesEquals(subgraph, [
        entity_a,
        entity_b,
        entity_c,
        entity_d,
        link_ab,
        link_ad,
        link_ba,
        link_bc,
        link_cb,
        link_cd,
        link_da,
        link_dc,
      ]),
    ).toBe(true);

    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ad,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_ba,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_da,
              direction: "backward",
            },
          ],
        },
        {
          source: entity_b,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ba,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_bc,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_cb,
              direction: "backward",
            },
          ],
        },
        {
          source: entity_d,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_da,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_dc,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_ad,
              direction: "backward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: link_cd,
              direction: "backward",
            },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ba,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ad,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
          ],
        },
        {
          source: link_da,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: link_bc,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
        {
          source: link_cb,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
        {
          source: link_cd,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
        {
          source: link_dc,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("finds D/A", async () => {
    const subgraph = await getEntities(graphContext, authentication, {
      query: createQuery({
        hasLeftEntity: {
          incoming: 3,
          outgoing: 0,
        },
        hasRightEntity: {
          incoming: 0,
          outgoing: 3,
        },
      }),
    });

    expect(getRoots(subgraph)).toStrictEqual([entity_a]);
    expect(
      verticesEquals(subgraph, [
        entity_a,
        entity_b,
        entity_c,
        entity_d,
        link_ab,
        link_ad,
        link_ba,
        link_bc,
        link_cb,
        link_cd,
        link_da,
        link_dc,
      ]),
    ).toBe(true);

    expect(
      edgesEquals(subgraph, [
        {
          source: entity_a,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ad,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ab,
              direction: "backward",
            },
          ],
        },
        {
          source: entity_b,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_ba,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_bc,
              direction: "backward",
            },
          ],
        },
        {
          source: entity_c,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_cb,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_cd,
              direction: "backward",
            },
          ],
        },
        {
          source: entity_d,
          edges: [
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_da,
              direction: "backward",
            },
            {
              kind: "HAS_LEFT_ENTITY",
              target: link_dc,
              direction: "backward",
            },
          ],
        },
        {
          source: link_ab,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ba,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: link_ad,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
          ],
        },
        {
          source: link_da,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_a,
              direction: "forward",
            },
          ],
        },
        {
          source: link_bc,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
        {
          source: link_cb,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_b,
              direction: "forward",
            },
          ],
        },
        {
          source: link_cd,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_d,
              direction: "forward",
            },
          ],
        },
        {
          source: link_dc,
          edges: [
            {
              kind: "HAS_RIGHT_ENTITY",
              target: entity_c,
              direction: "forward",
            },
          ],
        },
      ]),
    ).toBe(true);
  });
});
