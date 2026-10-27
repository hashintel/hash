import { expect, test, vi } from "vitest";

import {
  createHashEntityReadTool,
  createHashEntityTypeReadTool,
  createHashWebReadTool,
  hashEntityReadRequest,
  hashEntityTypeReadRequest,
  type HashWebReadUser,
  type QueryEntitySubgraph,
  type QueryEntityTypes,
} from "./brunch-hash-graph-reads";

import type {
  QueryEntitySubgraphQuery,
  QueryEntityTypesQuery,
} from "../../../../../../graphql/api-types.gen";
import type {
  PetrinautAiAutomaticTool,
  PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/brunch-agent/ui";

const archivedUrl = "https://hash.ai/@h/types/property-type/archived/";
/** Neither archived by the metadata flag, nor, as pages are, by the `archived` property. */
const notArchived = [
  { equal: [{ path: ["archived"] }, { parameter: false }] },
  {
    any: [
      { not: { exists: { path: ["properties", archivedUrl] } } },
      { equal: [{ path: ["properties", archivedUrl] }, { parameter: false }] },
    ],
  },
];

/** Along a link from the entity it points from, to the entity it points to. */
const forward = [
  { kind: "has-left-entity", direction: "incoming" },
  { kind: "has-right-entity", direction: "outgoing" },
];
/** Along a link from the entity it points to, back to the entity it points from. */
const backward = [
  { kind: "has-right-entity", direction: "incoming" },
  { kind: "has-left-entity", direction: "outgoing" },
];
/** From a matched link entity to each of its endpoints. */
const linkEndpoints = [
  { edges: [{ kind: "has-left-entity", direction: "outgoing" }] },
  { edges: [{ kind: "has-right-entity", direction: "outgoing" }] },
];

const oneLinkDeep = [{ edges: forward }, { edges: backward }, ...linkEndpoints];

test("a read with no filters asks for every visible, unarchived entity one link deep, without drafts, with its types resolved", () => {
  expect(hashEntityReadRequest({})).toMatchObject({
    filter: { all: notArchived },
    traversalPaths: oneLinkDeep,
    includeDrafts: false,
    includePermissions: false,
    includeEntityTypes: "resolved",
  });
});

test("each given filter must match, and within one any listed value matches", () => {
  const typeUrl = "https://hash.ai/@alice/types/entity-type/supplier/v/1";
  const request = hashEntityReadRequest({
    entityTypes: ["Supplier", typeUrl],
    entityIds: ["alice-web~supplier"],
    webIds: ["alice-web", "org-web"],
    includeDrafts: true,
  });
  expect(request.filter).toEqual({
    all: [
      {
        any: [
          {
            equal: [{ path: ["type", "title"] }, { parameter: "Supplier" }],
          },
          {
            equal: [{ path: ["type", "versionedUrl"] }, { parameter: typeUrl }],
          },
        ],
      },
      {
        any: [
          {
            all: [
              { equal: [{ path: ["uuid"] }, { parameter: "supplier" }] },
              { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
            ],
          },
        ],
      },
      {
        any: [
          { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
          { equal: [{ path: ["webId"] }, { parameter: "org-web" }] },
        ],
      },
      ...notArchived,
    ],
  });
  expect(request.includeDrafts).toBe(true);
});

test("an entity id that names a draft reads that draft, even when drafts weren't asked for", () => {
  const request = hashEntityReadRequest({
    entityIds: ["alice-web~supplier~draft-1"],
  });
  expect(request.filter).toEqual({
    all: [
      {
        any: [
          {
            all: [
              { equal: [{ path: ["uuid"] }, { parameter: "supplier" }] },
              { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
              { equal: [{ path: ["draftId"] }, { parameter: "draft-1" }] },
            ],
          },
        ],
      },
      ...notArchived,
    ],
  });
  expect(request.includeDrafts).toBe(true);
});

test("an id without a draft part, read beside a draft id, still reads only the live entity", () => {
  const request = hashEntityReadRequest({
    entityIds: ["alice-web~supplier~draft-1", "alice-web~product"],
  });
  expect(request.filter).toEqual({
    all: [
      {
        any: [
          {
            all: [
              { equal: [{ path: ["uuid"] }, { parameter: "supplier" }] },
              { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
              { equal: [{ path: ["draftId"] }, { parameter: "draft-1" }] },
            ],
          },
          {
            all: [
              { equal: [{ path: ["uuid"] }, { parameter: "product" }] },
              { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
              { not: { exists: { path: ["draftId"] } } },
            ],
          },
        ],
      },
      ...notArchived,
    ],
  });
  expect(request.includeDrafts).toBe(true);
});

test("traversal follows every chain of links as deep as asked, each link in either direction, and a matched link's endpoints", () => {
  const pathsAt = (traversalDepth: number) =>
    hashEntityReadRequest({ traversalDepth }).traversalPaths;

  expect(pathsAt(0)).toEqual([]);
  expect(pathsAt(1)).toEqual(oneLinkDeep);
  expect(pathsAt(2)).toEqual([
    { edges: [...forward, ...forward] },
    { edges: [...forward, ...backward] },
    { edges: [...backward, ...forward] },
    { edges: [...backward, ...backward] },
    ...linkEndpoints,
  ]);

  const depthThree = pathsAt(3);
  expect(depthThree).toHaveLength(10);
  expect(depthThree).toEqual(
    expect.arrayContaining([
      { edges: [...forward, ...backward, ...forward] },
      { edges: [...backward, ...backward, ...backward] },
      ...linkEndpoints,
    ]),
  );
  const chains = depthThree.filter(({ edges }) => edges.length === 6);
  expect(new Set(chains.map(({ edges }) => JSON.stringify(edges))).size).toBe(
    8,
  );
});

test("traversal at its deepest stays within the graph's limits of 10 paths of 10 edges", () => {
  const paths = hashEntityReadRequest({ traversalDepth: 3 }).traversalPaths;
  expect(paths.length).toBeLessThanOrEqual(10);
  for (const { edges } of paths) {
    expect(edges.length).toBeLessThanOrEqual(10);
  }
});

test("from A, a chain A → B ← C reaches C at depth 2, and a link read reaches both its endpoints", () => {
  // The graph follows a path's edges one per step, so C is reached only by a
  // path whose edges are A's link forward then C's link backward.
  expect(
    hashEntityReadRequest({ traversalDepth: 2 }).traversalPaths,
  ).toContainEqual({ edges: [...forward, ...backward] });
  for (const traversalDepth of [1, 2, 3]) {
    expect(hashEntityReadRequest({ traversalDepth }).traversalPaths).toEqual(
      expect.arrayContaining(linkEndpoints),
    );
  }
});

const entity = ({
  entityId,
  editionId,
  properties,
  linkData,
}: {
  entityId: string;
  editionId: string;
  properties: Record<string, unknown>;
  linkData?: { leftEntityId: string; rightEntityId: string };
}) => ({
  kind: "entity",
  inner: {
    metadata: {
      recordId: { entityId, editionId },
      entityTypeIds: [
        linkData
          ? "https://hash.ai/@h/types/entity-type/has/v/1"
          : "https://hash.ai/@alice/types/entity-type/supplier/v/1",
      ],
    },
    properties,
    ...(linkData ? { linkData } : {}),
  },
});

const nameUrl = "https://hash.ai/@alice/types/property-type/name/";
const supplierTypeId = "https://hash.ai/@alice/types/entity-type/supplier/v/1";
const hasTypeId = "https://hash.ai/@h/types/entity-type/has/v/1";
const closedType = ($id: string, title: string, labelProperty?: string) => ({
  schema: {
    properties: {},
    allOf: [{ $id, title, allOf: [{ $id, depth: 0, labelProperty }] }],
  },
});
const propertyType = ($id: string, title: string, description?: string) => ({
  $id,
  title,
  ...(description === undefined ? {} : { description }),
});
const closedTypes = {
  [supplierTypeId]: closedType(supplierTypeId, "Supplier", nameUrl),
  [hasTypeId]: closedType(hasTypeId, "Has"),
};
/**
 * Alice's supplier, matched, and the link the traversal reached from it,
 * with the closed types given.
 */
const responseWith = (closedMultiEntityTypes: object) =>
  ({
    queryEntitySubgraph: {
      closedMultiEntityTypes,
      definitions: {
        dataTypes: {},
        entityTypes: {},
        propertyTypes: {
          // Two versions of the one property: the later one is described.
          [`${nameUrl}v/1`]: propertyType(`${nameUrl}v/1`, "Old name"),
          [`${nameUrl}v/2`]: propertyType(
            `${nameUrl}v/2`,
            "Name",
            "What it's called.",
          ),
          // A property no returned entity carries is left out.
          "https://hash.ai/@alice/types/property-type/unused/v/1": propertyType(
            "https://hash.ai/@alice/types/property-type/unused/v/1",
            "Unused",
          ),
        },
      },
      subgraph: {
        roots: [
          { baseId: "alice-web~supplier", revisionId: "2026-10-26T00:00:00Z" },
        ],
        vertices: {
          "alice-web~supplier": {
            "2026-10-26T00:00:00Z": entity({
              entityId: "alice-web~supplier",
              editionId: "edition-2",
              properties: { [nameUrl]: "Acme Parts" },
            }),
          },
          "alice-web~link": {
            "2026-10-25T00:00:00Z": entity({
              entityId: "alice-web~link",
              editionId: "edition-7",
              properties: {},
              linkData: {
                leftEntityId: "alice-web~supplier",
                rightEntityId: "alice-web~product",
              },
            }),
          },
        },
        edges: {},
        temporalAxes: {},
      },
    },
  }) as unknown as QueryEntitySubgraphQuery;
const response = responseWith(closedTypes);

const runTool = (
  tool: PetrinautAiAutomaticTool,
  input: unknown,
  signal = new AbortController().signal,
) =>
  // The panel awaits a host tool, so a synchronous throw is a rejection too.
  Promise.resolve().then(() =>
    tool.execute({
      input,
      toolCallId: "read",
      signal,
    } as PetrinautAiAutomaticToolExecuteParams),
  );
const run = (query: QueryEntitySubgraph, input: unknown) =>
  runTool(createHashEntityReadTool(query), input);

test("the read runs the request it built and returns each entity from its own edition", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  const input = { entityTypes: ["Supplier"], traversalDepth: 1 };

  const output = await run(query, input);

  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(input),
    expect.any(AbortSignal),
  );
  expect(output).toEqual({
    propertyTypes: [
      { baseUrl: nameUrl, title: "Name", description: "What it's called." },
    ],
    entityTypes: [
      { entityTypeId: supplierTypeId, title: "Supplier" },
      { entityTypeId: hasTypeId, title: "Has" },
    ],
    entities: [
      {
        entityId: "alice-web~supplier",
        editionId: "edition-2",
        webId: "alice-web",
        entityTypeIds: [
          "https://hash.ai/@alice/types/entity-type/supplier/v/1",
        ],
        label: "Acme Parts",
        properties: { [nameUrl]: "Acme Parts" },
        draft: false,
        matched: true,
      },
      {
        entityId: "alice-web~link",
        editionId: "edition-7",
        webId: "alice-web",
        entityTypeIds: ["https://hash.ai/@h/types/entity-type/has/v/1"],
        label: "Has-lin",
        properties: {},
        draft: false,
        matched: false,
        linkData: {
          leftEntityId: "alice-web~supplier",
          rightEntityId: "alice-web~product",
        },
      },
    ],
  });
});

test("an entity reached by following links is left out when archived by its property, as pages are", async () => {
  const { subgraph } = response.queryEntitySubgraph;
  const withArchivedPage = {
    queryEntitySubgraph: {
      ...response.queryEntitySubgraph,
      subgraph: {
        ...subgraph,
        vertices: {
          ...subgraph.vertices,
          "alice-web~page": {
            "2026-10-24T00:00:00Z": entity({
              entityId: "alice-web~page",
              editionId: "edition-3",
              properties: { [archivedUrl]: true },
            }),
          },
          "alice-web~live-page": {
            "2026-10-24T00:00:00Z": entity({
              entityId: "alice-web~live-page",
              editionId: "edition-4",
              properties: { [archivedUrl]: false },
            }),
          },
        },
      },
    },
  } as unknown as QueryEntitySubgraphQuery;

  const output = await run(() => Promise.resolve(withArchivedPage), {});

  expect(
    (output as { entities: { entityId: string }[] }).entities.map(
      ({ entityId }) => entityId,
    ),
  ).toEqual(["alice-web~supplier", "alice-web~link", "alice-web~live-page"]);
});

/** Draft links, as created when either endpoint is a draft, in both directions. */
const draftSupplierId = "alice-web~supplier~draft-1";
const otherDraftId = "alice-web~rival~draft-2";
const liveProductId = "alice-web~product";
const toRivalId = "alice-web~to-rival~draft-ab";
const toProductId = "alice-web~to-product~draft-ac";
const fromProductId = "alice-web~from-product~draft-ca";
const unrelatedLinkId = "alice-web~unrelated~draft-bc";
const linkToLinkId = "alice-web~link-to-link~draft-link";
const withLinkedDrafts = {
  queryEntitySubgraph: {
    ...response.queryEntitySubgraph,
    subgraph: {
      roots: [{ baseId: draftSupplierId, revisionId: "2026-10-26T00:00:00Z" }],
      vertices: Object.fromEntries(
        [
          entity({
            entityId: draftSupplierId,
            editionId: "edition-a",
            properties: {},
          }),
          entity({
            entityId: otherDraftId,
            editionId: "edition-b",
            properties: {},
          }),
          entity({
            entityId: liveProductId,
            editionId: "edition-c",
            properties: {},
          }),
          entity({
            entityId: toRivalId,
            editionId: "edition-ab",
            properties: {},
            linkData: {
              leftEntityId: draftSupplierId,
              rightEntityId: otherDraftId,
            },
          }),
          entity({
            entityId: toProductId,
            editionId: "edition-ac",
            properties: {},
            linkData: {
              leftEntityId: draftSupplierId,
              rightEntityId: liveProductId,
            },
          }),
          entity({
            entityId: fromProductId,
            editionId: "edition-ca",
            properties: {},
            linkData: {
              leftEntityId: liveProductId,
              rightEntityId: draftSupplierId,
            },
          }),
          entity({
            entityId: unrelatedLinkId,
            editionId: "edition-bc",
            properties: {},
            linkData: {
              leftEntityId: otherDraftId,
              rightEntityId: liveProductId,
            },
          }),
          entity({
            entityId: linkToLinkId,
            editionId: "edition-link",
            properties: {},
            linkData: {
              leftEntityId: toProductId,
              rightEntityId: liveProductId,
            },
          }),
        ].map((vertex) => [
          vertex.inner.metadata.recordId.entityId,
          { "2026-10-26T00:00:00Z": vertex },
        ]),
      ),
      edges: {},
      temporalAxes: {},
    },
  },
} as unknown as QueryEntitySubgraphQuery;
const entityIdsRead = async (input: unknown) =>
  (
    (await run(() => Promise.resolve(withLinkedDrafts), input)) as {
      entities: { entityId: string }[];
    }
  ).entities.map(({ entityId }) => entityId);

test.each([undefined, false])(
  "a read that names a draft with includeDrafts %s retains its draft links without widening to other drafts or links",
  async (includeDrafts) => {
    const query = vi.fn<QueryEntitySubgraph>(() =>
      Promise.resolve(withLinkedDrafts),
    );
    const output = await run(query, {
      entityIds: [draftSupplierId],
      includeDrafts,
    });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        includeDrafts: true,
        traversalPaths: oneLinkDeep,
      }),
      expect.any(AbortSignal),
    );
    expect(output).toMatchObject({
      entities: [
        { entityId: draftSupplierId, draft: true, matched: true },
        { entityId: liveProductId, draft: false, matched: false },
        {
          entityId: toRivalId,
          draft: true,
          linkData: {
            leftEntityId: draftSupplierId,
            rightEntityId: otherDraftId,
          },
        },
        {
          entityId: toProductId,
          draft: true,
          linkData: {
            leftEntityId: draftSupplierId,
            rightEntityId: liveProductId,
          },
        },
        {
          entityId: fromProductId,
          draft: true,
          linkData: {
            leftEntityId: liveProductId,
            rightEntityId: draftSupplierId,
          },
        },
      ],
    });
  },
);

test("an explicitly named draft link is retained without retaining its unnamed draft endpoint", async () => {
  expect(await entityIdsRead({ entityIds: [unrelatedLinkId] })).toEqual([
    liveProductId,
    unrelatedLinkId,
  ]);
});

test("a read that asks for drafts returns every draft reached by following links", async () => {
  const everyEntity = [
    draftSupplierId,
    otherDraftId,
    liveProductId,
    toRivalId,
    toProductId,
    fromProductId,
    unrelatedLinkId,
    linkToLinkId,
  ];
  expect(
    await entityIdsRead({ entityIds: [draftSupplierId], includeDrafts: true }),
  ).toEqual(everyEntity);
  expect(await entityIdsRead({ includeDrafts: true })).toEqual(everyEntity);
});

test("a read that names no draft returns whatever the graph returns", async () => {
  expect(await entityIdsRead({ entityIds: [liveProductId] })).toContain(
    otherDraftId,
  );
  expect(await entityIdsRead({})).toHaveLength(8);
});

test("a response with a cursor, which the graph sets when it stopped at its limit, marks the read truncated", async () => {
  const withCursor = (cursor: unknown) =>
    ({
      queryEntitySubgraph: { ...response.queryEntitySubgraph, cursor },
    }) as unknown as QueryEntitySubgraphQuery;

  await expect(
    run(() => Promise.resolve(withCursor({ editionId: "x" })), {}),
  ).resolves.toMatchObject({ truncated: true });
  await expect(
    run(() => Promise.resolve(withCursor(null)), {}),
  ).resolves.not.toHaveProperty("truncated");
  await expect(
    run(() => Promise.resolve(response), {}),
  ).resolves.not.toHaveProperty("truncated");
});

test("a failed query settles the read with its message, so the agent can tell the model why", async () => {
  const graphQlError = new Error("Response not successful: GraphQL error");
  await expect(run(() => Promise.reject(graphQlError), {})).resolves.toEqual({
    error: "Response not successful: GraphQL error",
  });
});

test("a query that fails because the call was cancelled still rejects", async () => {
  const controller = new AbortController();
  const aborted = new Error("aborted");
  const tool = createHashEntityReadTool(() => {
    controller.abort();
    return Promise.reject(aborted);
  });
  await expect(runTool(tool, {}, controller.signal)).rejects.toBe(aborted);
});

test("each entity is labelled from its closed type, and an entity whose closed type the response lacks has no label", async () => {
  const onlySupplierClosed = responseWith({
    [supplierTypeId]: closedTypes[supplierTypeId],
  });
  const output = await run(() => Promise.resolve(onlySupplierClosed), {});
  expect(output).toMatchObject({
    entityTypes: [{ entityTypeId: supplierTypeId, title: "Supplier" }],
    entities: [
      { entityId: "alice-web~supplier", label: "Acme Parts" },
      { entityId: "alice-web~link" },
    ],
  });
  expect(output).not.toHaveProperty(["entities", 1, "label"]);
});

test("the agent's own keys, such as which values it shows in full, are accepted and don't change what is read", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  const input = { entityIds: ["alice-web~supplier"] };
  const output = await run(query, {
    ...input,
    fullValuesFor: ["alice-web~supplier"],
  });
  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(input),
    expect.any(AbortSignal),
  );
  expect(output).toEqual(await run(query, input));
});

test("an input the agent's contract doesn't allow is refused before any query", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(run(query, { entityTypes: "Supplier" })).rejects.toThrow();
  await expect(run(query, { traversalDepth: -1 })).rejects.toThrow();
  await expect(run(query, { traversalDepth: 1.5 })).rejects.toThrow();
  await expect(run(query, { traversalDepth: 4 })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});

const latestOnly = { equal: [{ path: ["version"] }, { parameter: "latest" }] };

test("a type read with no webs asks for the latest version of every visible type, resolved", () => {
  expect(hashEntityTypeReadRequest({})).toMatchObject({
    filter: { all: [latestOnly] },
    includeEntityTypes: "resolved",
  });
});

test("a type read limited to webs matches a type in any of them", () => {
  expect(
    hashEntityTypeReadRequest({ webIds: ["alice-web", "org-web"] }).filter,
  ).toEqual({
    all: [
      latestOnly,
      {
        any: [
          { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
          { equal: [{ path: ["webId"] }, { parameter: "org-web" }] },
        ],
      },
    ],
  });
});

test("a type read by the entities' type ids matches exactly those versions, not the latest, in any given web", () => {
  const supplierV1 = "https://hash.ai/@h/types/entity-type/supplier/v/1";
  const productV3 = "https://hash.ai/@h/types/entity-type/product/v/3";
  expect(
    hashEntityTypeReadRequest({
      entityTypeIds: [supplierV1, productV3],
      webIds: ["h-web"],
    }),
  ).toMatchObject({
    filter: {
      all: [
        {
          any: [
            { equal: [{ path: ["versionedUrl"] }, { parameter: supplierV1 }] },
            { equal: [{ path: ["versionedUrl"] }, { parameter: productV3 }] },
          ],
        },
        { any: [{ equal: [{ path: ["webId"] }, { parameter: "h-web" }] }] },
      ],
    },
    includeEntityTypes: "resolved",
  });
  expect(
    JSON.stringify(
      hashEntityTypeReadRequest({ entityTypeIds: [supplierV1] }).filter,
    ),
  ).not.toContain("latest");
});

const typeUrl = (name: string) =>
  `https://hash.ai/@alice/types/entity-type/${name}/v/1`;
const propertyUrl = (name: string) =>
  `https://hash.ai/@alice/types/property-type/${name}/`;
/** Alice's supplier type, which inherits a name and links to products. */
const typesResponse = {
  queryEntityTypes: {
    entityTypes: [
      {
        schema: {
          $id: typeUrl("supplier"),
          title: "Supplier",
          description: "Someone who supplies parts.",
          properties: {
            [propertyUrl("rating")]: { $ref: `${propertyUrl("rating")}v/1` },
          },
          links: {},
        },
        metadata: {},
      },
    ],
    closedEntityTypes: [
      {
        $id: typeUrl("supplier"),
        title: "Supplier",
        description: "Someone who supplies parts.",
        properties: {
          [propertyUrl("name")]: { $ref: `${propertyUrl("name")}v/1` },
          [propertyUrl("rating")]: {
            type: "array",
            items: { $ref: `${propertyUrl("rating")}v/1` },
          },
        },
        links: {
          [typeUrl("supplies")]: {
            type: "array",
            items: { oneOf: [{ $ref: typeUrl("product") }] },
          },
          [typeUrl("knows")]: { type: "array", items: {} },
        },
        allOf: [{ $id: typeUrl("supplier"), depth: 0 }],
      },
    ],
    definitions: {
      dataTypes: {},
      propertyTypes: {
        [`${propertyUrl("name")}v/1`]: { title: "Name" },
        [`${propertyUrl("rating")}v/1`]: { title: "Rating" },
      },
      entityTypes: { [typeUrl("supplies")]: { title: "Supplies" } },
    },
  },
} as unknown as QueryEntityTypesQuery;

test("the type read runs the request it built and returns each type closed, with titled properties and links", async () => {
  const query = vi.fn<QueryEntityTypes>(() => Promise.resolve(typesResponse));
  const input = { webIds: ["alice-web"] };

  const output = await runTool(createHashEntityTypeReadTool(query), input);

  expect(query).toHaveBeenCalledWith(
    hashEntityTypeReadRequest(input),
    expect.any(AbortSignal),
  );
  expect(output).toEqual({
    entityTypes: [
      {
        entityTypeId: typeUrl("supplier"),
        title: "Supplier",
        description: "Someone who supplies parts.",
        properties: [
          { baseUrl: propertyUrl("name"), title: "Name" },
          { baseUrl: propertyUrl("rating"), title: "Rating" },
        ],
        links: [
          {
            linkEntityTypeId: typeUrl("supplies"),
            title: "Supplies",
            destinationEntityTypeIds: [typeUrl("product")],
          },
          { linkEntityTypeId: typeUrl("knows") },
        ],
      },
    ],
  });
});

test("a type response with a cursor marks the type read truncated", async () => {
  const withCursor = {
    queryEntityTypes: {
      ...typesResponse.queryEntityTypes,
      cursor: typeUrl("supplier"),
    },
  } as unknown as QueryEntityTypesQuery;
  await expect(
    runTool(
      createHashEntityTypeReadTool(() => Promise.resolve(withCursor)),
      {},
    ),
  ).resolves.toMatchObject({ truncated: true });
  await expect(
    runTool(
      createHashEntityTypeReadTool(() => Promise.resolve(typesResponse)),
      {},
    ),
  ).resolves.not.toHaveProperty("truncated");
});

test("a failed type query settles the read with its message", async () => {
  const tool = createHashEntityTypeReadTool(() =>
    Promise.reject(new Error("Response not successful: GraphQL error")),
  );
  await expect(runTool(tool, {})).resolves.toEqual({
    error: "Response not successful: GraphQL error",
  });
});

test("a type read input the agent's contract doesn't allow is refused before any query", async () => {
  const query = vi.fn<QueryEntityTypes>(() => Promise.resolve(typesResponse));
  await expect(
    runTool(createHashEntityTypeReadTool(query), { webIds: "alice-web" }),
  ).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});

const alice: HashWebReadUser = {
  accountId: "alice-web" as HashWebReadUser["accountId"],
  shortname: "alice",
  displayName: "Alice",
  memberOf: [
    {
      org: {
        webId: "org-web" as HashWebReadUser["memberOf"][number]["org"]["webId"],
        shortname: "acme",
        name: "Acme",
      },
    },
  ],
};

test("the web read lists the signed-in user's own web, then their orgs', from the user the page holds", async () => {
  let user: HashWebReadUser | undefined = alice;
  const tool = createHashWebReadTool(() => user);

  await expect(runTool(tool, {})).resolves.toEqual({
    webs: [
      { webId: "alice-web", kind: "user", shortname: "alice", name: "Alice" },
      {
        webId: "org-web",
        kind: "organization",
        shortname: "acme",
        name: "Acme",
      },
    ],
  });

  user = { accountId: alice.accountId, memberOf: [] };
  await expect(runTool(tool, {})).resolves.toEqual({
    webs: [{ webId: "alice-web", kind: "user" }],
  });

  user = undefined;
  await expect(runTool(tool, {})).resolves.toEqual({
    error: "No user is signed in to HASH.",
  });
});
