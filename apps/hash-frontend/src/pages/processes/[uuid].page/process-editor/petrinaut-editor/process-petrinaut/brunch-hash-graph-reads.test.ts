import { expect, test, vi } from "vitest";

import {
  type HashEntityReadResult,
  hashEntityReadDefaultLimit,
  hashEntityReadMaxTraversalDepth,
} from "@hashintel/brunch-agent";

import {
  createHashEntityCountTool,
  createHashEntityReadTool,
  createHashEntityTypeReadTool,
  createHashWebReadTool,
  decodeHashEntityReadCursor,
  encodeHashEntityReadCursor,
  hashEntityCountRequest,
  hashEntityReadRequest,
  hashEntityReadWebIds,
  hashEntityTypeReadRequest,
  hashReadWebScope,
  type HashWebReadUser,
  type QueryEntitySubgraph,
  type QueryEntityTypes,
  type SummarizeEntities,
} from "./brunch-hash-graph-reads";

import type {
  QueryEntitySubgraphQuery,
  QueryEntityTypesQuery,
  SummarizeEntitiesQuery,
} from "../../../../../../graphql/api-types.gen";
import type {
  PetrinautAiAutomaticTool,
  PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/brunch-agent/ui";
import type { EntityQueryCursor } from "@local/hash-graph-client";

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

/** The reader's own web and their org's: the entity read's default scope. */
const readerWebs = ["alice-web", "org-web"];
const inWebs = (webIds: readonly string[]) => ({
  any: webIds.map((webId) => ({
    equal: [{ path: ["webId"] }, { parameter: webId }],
  })),
});

test("a read with no filters asks for every visible, unarchived entity in the webs given, one link deep, without drafts, with its types resolved", () => {
  expect(hashEntityReadRequest({}, readerWebs)).toMatchObject({
    filter: { all: [inWebs(readerWebs), ...notArchived] },
    traversalPaths: oneLinkDeep,
    includeDrafts: false,
    includePermissions: false,
    includeEntityTypes: "resolved",
  });
});

test("each given filter must match, and within one any listed value matches", () => {
  const typeUrl = "https://hash.ai/@alice/types/entity-type/supplier/v/1";
  const input = {
    entityTypes: ["Supplier", typeUrl],
    entityIds: ["alice-web~supplier"],
    webIds: ["alice-web", "org-web"],
    includeDrafts: true,
  };
  const request = hashEntityReadRequest(input, input.webIds);
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
  const request = hashEntityReadRequest(
    { entityIds: ["alice-web~supplier~draft-1"] },
    undefined,
  );
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
  const request = hashEntityReadRequest(
    { entityIds: ["alice-web~supplier~draft-1", "alice-web~product"] },
    undefined,
  );
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
    hashEntityReadRequest({ traversalDepth }, readerWebs).traversalPaths;

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
  const paths = hashEntityReadRequest(
    { traversalDepth: hashEntityReadMaxTraversalDepth },
    readerWebs,
  ).traversalPaths;
  expect(paths.length).toBeLessThanOrEqual(10);
  for (const { edges } of paths) {
    expect(edges.length).toBeLessThanOrEqual(10);
  }
});

test("from A, a chain A → B ← C reaches C at depth 2, and a link read reaches both its endpoints", () => {
  // The graph follows a path's edges one per step, so C is reached only by a
  // path whose edges are A's link forward then C's link backward.
  expect(
    hashEntityReadRequest({ traversalDepth: 2 }, readerWebs).traversalPaths,
  ).toContainEqual({ edges: [...forward, ...backward] });
  for (const traversalDepth of [1, 2, 3]) {
    expect(
      hashEntityReadRequest({ traversalDepth }, readerWebs).traversalPaths,
    ).toEqual(expect.arrayContaining(linkEndpoints));
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
/** The user reading: their own web, alice-web, and their org's, org-web. */
const reader: HashWebReadUser = {
  accountId: "alice-web" as HashWebReadUser["accountId"],
  memberOf: [
    {
      org: {
        webId: "org-web" as HashWebReadUser["memberOf"][number]["org"]["webId"],
        shortname: "org",
        name: "Org",
      },
    },
  ],
};
const run = (
  query: QueryEntitySubgraph,
  input: unknown,
  { signedIn = true }: { signedIn?: boolean } = {},
) =>
  runTool(
    createHashEntityReadTool(query, () => (signedIn ? reader : undefined)),
    input,
  );

test("the read runs the request it built and returns each entity from its own edition", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  const input = { entityTypes: ["Supplier"], traversalDepth: 1 };

  const output = await run(query, input);

  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(input, readerWebs),
    expect.any(AbortSignal),
  );
  expect(output).toEqual({
    propertyTypes: [
      { baseUrl: nameUrl, propertyTypeId: `${nameUrl}v/1`, title: "Old name" },
      {
        baseUrl: nameUrl,
        propertyTypeId: `${nameUrl}v/2`,
        title: "Name",
        description: "What it's called.",
      },
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

test("the host preserves both returned property versions with their distinct units", async () => {
  const durationUrl = "https://hash.ai/@alice/types/property-type/duration/";
  const mixedResponse = {
    queryEntitySubgraph: {
      ...response.queryEntitySubgraph,
      definitions: {
        ...response.queryEntitySubgraph.definitions,
        propertyTypes: {
          [`${durationUrl}v/1`]: propertyType(
            `${durationUrl}v/1`,
            "Duration",
            "Elapsed time in days.",
          ),
          [`${durationUrl}v/2`]: propertyType(
            `${durationUrl}v/2`,
            "Duration",
            "Elapsed time in hours.",
          ),
        },
      },
      subgraph: {
        ...response.queryEntitySubgraph.subgraph,
        vertices: {
          "alice-web~supplier": {
            "2026-10-26T00:00:00Z": entity({
              entityId: "alice-web~supplier",
              editionId: "edition-2",
              properties: { [durationUrl]: 5 },
            }),
          },
          "alice-web~other": {
            "2026-10-26T00:00:00Z": entity({
              entityId: "alice-web~other",
              editionId: "edition-other",
              properties: { [durationUrl]: 120 },
            }),
          },
        },
      },
    },
  } as unknown as QueryEntitySubgraphQuery;
  expect(await run(() => Promise.resolve(mixedResponse), {})).toMatchObject({
    propertyTypes: [
      {
        baseUrl: durationUrl,
        propertyTypeId: `${durationUrl}v/1`,
        title: "Duration",
        description: "Elapsed time in days.",
      },
      {
        baseUrl: durationUrl,
        propertyTypeId: `${durationUrl}v/2`,
        title: "Duration",
        description: "Elapsed time in hours.",
      },
    ],
    entities: [
      { properties: { [durationUrl]: 5 } },
      { properties: { [durationUrl]: 120 } },
    ],
  });
});

test("nested property definitions retain units through arrays without defining opaque JSON keys", async () => {
  const durationUrl = "https://hash.ai/@alice/types/property-type/duration/";
  const properties = {
    [nameUrl]: "Acme Parts",
    "https://hash.ai/@alice/types/property-type/order/": {
      items: [{ [durationUrl]: 5, note: "opaque", duration: 1 }],
    },
  };
  const nestedResponse = {
    queryEntitySubgraph: {
      ...response.queryEntitySubgraph,
      definitions: {
        ...response.queryEntitySubgraph.definitions,
        propertyTypes: {
          ...response.queryEntitySubgraph.definitions?.propertyTypes,
          [`${durationUrl}v/1`]: propertyType(
            `${durationUrl}v/1`,
            "Duration",
            "Elapsed time in days.",
          ),
        },
      },
      subgraph: {
        ...response.queryEntitySubgraph.subgraph,
        vertices: {
          "alice-web~supplier": {
            "2026-10-26T00:00:00Z": entity({
              entityId: "alice-web~supplier",
              editionId: "edition-2",
              properties,
            }),
          },
        },
      },
    },
  } as unknown as QueryEntitySubgraphQuery;
  const output = await run(() => Promise.resolve(nestedResponse), {});
  expect(output).toMatchObject({
    propertyTypes: [
      { baseUrl: nameUrl, propertyTypeId: `${nameUrl}v/1`, title: "Old name" },
      {
        baseUrl: nameUrl,
        propertyTypeId: `${nameUrl}v/2`,
        title: "Name",
        description: "What it's called.",
      },
      {
        baseUrl: durationUrl,
        title: "Duration",
        description: "Elapsed time in days.",
      },
    ],
    entities: [{ properties }],
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

/**
 * A cursor as the graph sends one: the last match's sort values, which the
 * graph's client types as objects.
 */
const graphCursor = [
  "2026-10-26T00:00:00Z",
  "supplier",
  "alice-web",
] as unknown as EntityQueryCursor;

test("a read asks for a page of the default size, or of the limit given, from the cursor given", () => {
  expect(hashEntityReadRequest({}, readerWebs)).toMatchObject({
    limit: hashEntityReadDefaultLimit,
  });
  expect(hashEntityReadRequest({}, readerWebs)).not.toHaveProperty("cursor");
  expect(
    hashEntityReadRequest({ limit: 25 }, readerWebs, graphCursor),
  ).toMatchObject({ limit: 25, cursor: graphCursor });
});

test("a cursor round-trips through its text exactly, and text that isn't one fails", () => {
  const cursor = [
    "2026-10-26T00:00:00.123456Z",
    { nested: ["ünïcode ✓", 1, null] },
    "alice-web",
  ] as unknown as EntityQueryCursor;
  const text = encodeHashEntityReadCursor(cursor);
  expect(text).toMatch(/^[A-Za-z0-9_-]+$/u);
  expect(decodeHashEntityReadCursor(text)).toEqual(cursor);

  const malformed = {
    error:
      "The cursor isn't one this read gave. Repeat the read without a cursor to start from the first page.",
  };
  for (const notACursor of [
    "not a cursor",
    "!!!",
    encodeHashEntityReadCursor({} as never),
    encodeHashEntityReadCursor([]),
    btoa("not json"),
    text.slice(0, -3),
  ]) {
    expect(decodeHashEntityReadCursor(notACursor)).toEqual(malformed);
  }
});

test("a response with a cursor, which the graph sets when the page holds its limit, gives the read that cursor, encoded", async () => {
  const withCursor = (cursor: unknown) =>
    ({
      queryEntitySubgraph: { ...response.queryEntitySubgraph, cursor },
    }) as unknown as QueryEntitySubgraphQuery;

  const output = await run(() => Promise.resolve(withCursor(graphCursor)), {});
  expect(output).toMatchObject({
    cursor: encodeHashEntityReadCursor(graphCursor),
  });
  expect(output).not.toHaveProperty("truncated");
  await expect(
    run(() => Promise.resolve(withCursor(null)), {}),
  ).resolves.not.toHaveProperty("cursor");
  await expect(
    run(() => Promise.resolve(response), {}),
  ).resolves.not.toHaveProperty("cursor");
});

test("a read given a cursor asks the graph for the page it names", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  const input = {
    entityTypes: ["Supplier"],
    limit: 50,
    cursor: encodeHashEntityReadCursor(graphCursor),
  };
  await run(query, input);
  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(input, readerWebs, graphCursor),
    expect.any(AbortSignal),
  );
  expect(query.mock.calls[0]?.[0]).toMatchObject({
    limit: 50,
    cursor: graphCursor,
  });
});

test("a read given a cursor it didn't give settles with an error saying to start again, without querying", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(run(query, { cursor: "not-a-cursor" })).resolves.toEqual({
    error:
      "The cursor isn't one this read gave. Repeat the read without a cursor to start from the first page.",
  });
  expect(query).not.toHaveBeenCalled();
});

test.each([
  [7, 3],
  [9, 3],
  [2, 1000],
  [1, 1],
])(
  "following each cursor until none comes back reads each of %s matches once, %s to a page",
  async (matches, limit) => {
    const ids = Array.from(
      { length: matches },
      (_, index) => `alice-web~supplier-${String(index).padStart(3, "0")}`,
    );
    const linkId = "alice-web~shared-link";
    /**
     * A graph over `ids` in a fixed order, cursoring by the last match a
     * page holds and giving a cursor whenever a page holds its limit, as the
     * graph does, so the last page may be empty. Each page also reaches the
     * same link, as traversal may.
     */
    const query = vi.fn<QueryEntitySubgraph>((request) => {
      const after = request.cursor?.[0] as string | undefined;
      const start = after === undefined ? 0 : ids.indexOf(after) + 1;
      const page = ids.slice(start, start + (request.limit ?? 1000));
      return Promise.resolve({
        queryEntitySubgraph: {
          ...response.queryEntitySubgraph,
          cursor: page.length === request.limit ? [page.at(-1)] : null,
          subgraph: {
            ...response.queryEntitySubgraph.subgraph,
            roots: page.map((baseId) => ({
              baseId,
              revisionId: "2026-10-26T00:00:00Z",
            })),
            vertices: Object.fromEntries([
              ...page.map((entityId) => [
                entityId,
                {
                  "2026-10-26T00:00:00Z": entity({
                    entityId,
                    editionId: `${entityId}-edition`,
                    properties: {},
                  }),
                },
              ]),
              [
                linkId,
                {
                  "2026-10-25T00:00:00Z": entity({
                    entityId: linkId,
                    editionId: "link-edition",
                    properties: {},
                    linkData: {
                      leftEntityId: ids[0]!,
                      rightEntityId: "alice-web~product",
                    },
                  }),
                },
              ],
            ]),
          },
        },
      } as unknown as QueryEntitySubgraphQuery);
    });

    const matched: string[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages <= matches + 1; pages++) {
      const output = (await run(query, {
        entityTypes: ["Supplier"],
        traversalDepth: 1,
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      })) as HashEntityReadResult;
      matched.push(
        ...output.entities
          .filter((read) => read.matched)
          .map(({ entityId }) => entityId),
      );
      cursor = output.cursor;
      if (cursor === undefined) {
        break;
      }
    }

    expect(cursor).toBeUndefined();
    expect(matched).toEqual(ids);
    expect(new Set(matched).size).toBe(matches);
    expect(query).toHaveBeenCalledTimes(Math.floor(matches / limit) + 1);
  },
);

test("a failed query settles the read with its message, so the agent can tell the model why", async () => {
  const graphQlError = new Error("Response not successful: GraphQL error");
  await expect(run(() => Promise.reject(graphQlError), {})).resolves.toEqual({
    error: "Response not successful: GraphQL error",
  });
});

test("a query that fails because the call was cancelled still rejects", async () => {
  const controller = new AbortController();
  const aborted = new Error("aborted");
  const tool = createHashEntityReadTool(
    () => {
      controller.abort();
      return Promise.reject(aborted);
    },
    () => reader,
  );
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
    hashEntityReadRequest(input, undefined),
    expect.any(AbortSignal),
  );
  expect(output).toEqual(await run(query, input));
});

const orderNumberUrl =
  "https://hash.ai/@h/types/property-type/sales-order-number/";
const isPaidUrl = "https://hash.ai/@h/types/property-type/is-paid/";
const orderNumberIs = (
  value: string | number | boolean,
  url = orderNumberUrl,
) => ({
  equal: [{ path: ["properties", url] }, { parameter: value }],
});

test("a read by property values adds one equal condition per value on its base URL, all of which must match beside the other filters", () => {
  const input = {
    entityTypes: ["Sales Order"],
    propertyEquals: [
      // A versioned id is reduced to its base URL, the key entities use.
      { property: `${orderNumberUrl}v/2`, value: "1000000283" },
      { property: isPaidUrl, value: false },
    ],
  };
  expect(hashEntityReadRequest(input, readerWebs).filter).toEqual({
    all: [
      {
        any: [
          {
            equal: [{ path: ["type", "title"] }, { parameter: "Sales Order" }],
          },
        ],
      },
      orderNumberIs("1000000283"),
      orderNumberIs(false, isPaidUrl),
      inWebs(readerWebs),
      ...notArchived,
    ],
  });
  // A number stays a number: it isn't coerced to the string a property may hold.
  expect(
    hashEntityReadRequest(
      { propertyEquals: [{ property: orderNumberUrl, value: 283 }] },
      readerWebs,
    ).filter,
  ).toEqual({ all: [orderNumberIs(283), inWebs(readerWebs), ...notArchived] });
});

test("the properties to show are the agent's to apply: they don't change what is read", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  const input = { entityIds: ["alice-web~supplier"] };
  const output = await run(query, {
    ...input,
    properties: [orderNumberUrl],
  });
  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(input, undefined),
    expect.any(AbortSignal),
  );
  expect(output).toEqual(await run(query, input));
});

test("an input the agent's contract doesn't allow is refused before any query", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(
    run(query, {
      propertyEquals: [{ property: "sales_order_number", value: "1" }],
    }),
  ).rejects.toThrow(/base URL/u);
  await expect(run(query, { entityTypes: "Supplier" })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});

/** The filter of the request the read ran. */
const filterRead = async (input: unknown) => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await run(query, input);
  return query.mock.calls[0]?.[0].filter;
};
const supplierIdFilter = {
  any: [
    {
      all: [
        { equal: [{ path: ["uuid"] }, { parameter: "supplier" }] },
        { equal: [{ path: ["webId"] }, { parameter: "hash-web" }] },
        { not: { exists: { path: ["draftId"] } } },
      ],
    },
  ],
};

test("a read naming no webs or entities reads only the user's own web and each org web, never every web they can see", async () => {
  expect(await filterRead({})).toEqual({
    all: [inWebs(["alice-web", "org-web"]), ...notArchived],
  });
  expect(await filterRead({ entityTypes: ["Supplier"] })).toEqual({
    all: [
      {
        any: [
          { equal: [{ path: ["type", "title"] }, { parameter: "Supplier" }] },
        ],
      },
      inWebs(["alice-web", "org-web"]),
      ...notArchived,
    ],
  });
});

test("a read naming webs reads exactly those, wherever they are", async () => {
  expect(await filterRead({ webIds: ["hash-web", "hash-web"] })).toEqual({
    all: [inWebs(["hash-web"]), ...notArchived],
  });
});

test("a read by entity ids alone adds no web filter, since each id names its web; with webIds too, both filters must match", async () => {
  expect(await filterRead({ entityIds: ["hash-web~supplier"] })).toEqual({
    all: [supplierIdFilter, ...notArchived],
  });
  expect(
    await filterRead({ entityIds: ["hash-web~supplier"], webIds: ["org-web"] }),
  ).toEqual({
    all: [supplierIdFilter, inWebs(["org-web"]), ...notArchived],
  });
});

test("with no user signed in, a read naming neither webs nor entities settles { error } without a query, and one naming them still runs", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(run(query, {}, { signedIn: false })).resolves.toEqual({
    error: "No user is signed in to HASH.",
  });
  await expect(
    run(query, { entityTypes: ["Supplier"] }, { signedIn: false }),
  ).resolves.toEqual({ error: "No user is signed in to HASH." });
  expect(query).not.toHaveBeenCalled();

  expect(hashEntityReadWebIds({ webIds: ["hash-web"] }, undefined)).toEqual({
    webIds: ["hash-web"],
  });
  expect(
    hashEntityReadWebIds({ entityIds: ["hash-web~supplier"] }, undefined),
  ).toEqual({});
});

test("an entity read never runs with an empty web scope, which would filter by no web", () => {
  expect(() => hashEntityReadRequest({}, [])).toThrow(/can't be empty/u);
});

/** One matched entity in each of four webs, and links reaching others. */
const acrossWebs = {
  queryEntitySubgraph: {
    ...response.queryEntitySubgraph,
    subgraph: {
      roots: ["alice-web~own", "org-web~org", "hash-web~named"].map(
        (baseId) => ({ baseId, revisionId: "2026-10-26T00:00:00Z" }),
      ),
      vertices: Object.fromEntries(
        [
          entity({
            entityId: "alice-web~own",
            editionId: "e1",
            properties: {},
          }),
          entity({ entityId: "org-web~org", editionId: "e2", properties: {} }),
          entity({
            entityId: "hash-web~named",
            editionId: "e3",
            properties: {},
          }),
          entity({
            entityId: "stranger-web~reached",
            editionId: "e4",
            properties: {},
          }),
          entity({
            entityId: "stranger-web~link",
            editionId: "e5",
            properties: {},
            linkData: {
              leftEntityId: "alice-web~own",
              rightEntityId: "stranger-web~reached",
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

const externality = async (input: unknown, signedIn = true) =>
  (
    (await run(() => Promise.resolve(acrossWebs), input, { signedIn })) as {
      entities: { entityId: string; matched: boolean; external?: true }[];
    }
  ).entities.map(({ entityId, matched, external }) => ({
    entityId,
    matched,
    external,
  }));

test("every entity outside the user's own and org webs is marked external, whether named, matched in a named web, or reached by links", async () => {
  const marked = [
    { entityId: "alice-web~own", matched: true, external: undefined },
    { entityId: "org-web~org", matched: true, external: undefined },
    { entityId: "hash-web~named", matched: true, external: true },
    { entityId: "stranger-web~reached", matched: false, external: true },
    { entityId: "stranger-web~link", matched: false, external: true },
  ];
  expect(
    await externality({ entityIds: ["alice-web~own", "hash-web~named"] }),
  ).toEqual(marked);
  expect(
    await externality({ webIds: ["alice-web", "org-web", "hash-web"] }),
  ).toEqual(marked);

  const output = await run(() => Promise.resolve(acrossWebs), {});
  expect(output).not.toHaveProperty(["entities", 0, "external"]);
  expect(output).toHaveProperty(["entities", 2, "external"], true);
});

test("with no user signed in, every entity read by id is external, since none is known to be the user's", async () => {
  expect(
    (await externality({ entityIds: ["alice-web~own"] }, false)).every(
      ({ external }) => external === true,
    ),
  ).toBe(true);
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

const countUser: HashWebReadUser = {
  accountId: "alice-web" as HashWebReadUser["accountId"],
  shortname: "alice",
  displayName: "Alice",
  memberOf: [
    {
      org: {
        webId:
          "acme-web" as HashWebReadUser["memberOf"][number]["org"]["webId"],
        shortname: "acme",
        name: "Acme",
      },
    },
  ],
};
const webIs = (webId: string) => ({
  equal: [{ path: ["webId"] }, { parameter: webId }],
});
const salesOrderTypeId =
  "https://hash.ai/@acme/types/entity-type/sales-order/v/1";
const customerTypeId = "https://hash.ai/@acme/types/entity-type/customer/v/2";
const countFlags = {
  includeDrafts: false,
  includeCount: true,
  includeTypeIds: true,
  includeTypeTitles: true,
  includeWebIds: true,
};

test("a read naming no webs covers the user's own web and each org web; one naming webs covers exactly those", () => {
  expect(hashReadWebScope(undefined, countUser)).toEqual({
    scope: "default",
    webIds: ["alice-web", "acme-web"],
  });
  expect(hashReadWebScope(["hash-web", "hash-web"], countUser)).toEqual({
    scope: "named",
    webIds: ["hash-web"],
  });
  expect(hashReadWebScope(["hash-web"], undefined)).toEqual({
    scope: "named",
    webIds: ["hash-web"],
  });
  expect(hashReadWebScope(undefined, undefined)).toEqual({
    error: "No user is signed in to HASH.",
  });
});

test("a count asks for the total, by type with titles and by web, of the entity read's unarchived, non-draft matches in the webs given", () => {
  expect(
    hashEntityCountRequest({ entityTypes: ["Sales Order", customerTypeId] }, [
      "alice-web",
      "acme-web",
    ]),
  ).toEqual({
    filter: {
      all: [
        {
          any: [
            {
              equal: [
                { path: ["type", "title"] },
                { parameter: "Sales Order" },
              ],
            },
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: customerTypeId },
              ],
            },
          ],
        },
        { any: [webIs("alice-web"), webIs("acme-web")] },
        ...notArchived,
      ],
    },
    temporalAxes: hashEntityReadRequest({}, readerWebs).temporalAxes,
    ...countFlags,
  });
  // The same type, property value and web filters the entity read builds.
  const typed = {
    entityTypes: ["Sales Order"],
    propertyEquals: [{ property: orderNumberUrl, value: "1000000283" }],
    webIds: ["alice-web"],
  };
  expect(hashEntityCountRequest(typed, typed.webIds).filter).toEqual(
    hashEntityReadRequest(typed, typed.webIds).filter,
  );
});

test("a count by property values adds one equal condition per value on its base URL", () => {
  expect(
    hashEntityCountRequest(
      {
        entityTypes: ["Sales Order"],
        propertyEquals: [
          { property: `${orderNumberUrl}v/1`, value: "1000000283" },
        ],
      },
      ["alice-web"],
    ).filter,
  ).toEqual({
    all: [
      {
        any: [
          {
            equal: [{ path: ["type", "title"] }, { parameter: "Sales Order" }],
          },
        ],
      },
      orderNumberIs("1000000283"),
      { any: [webIs("alice-web")] },
      ...notArchived,
    ],
  });
});

const summary = (
  summarizeEntities: SummarizeEntitiesQuery["summarizeEntities"],
): SummarizeEntitiesQuery => ({ summarizeEntities });

const count = (
  summarizeEntities: SummarizeEntities,
  input: unknown,
  {
    signedIn = true,
    query = vi.fn<QueryEntitySubgraph>(),
  }: { signedIn?: boolean; query?: QueryEntitySubgraph } = {},
) =>
  runTool(
    createHashEntityCountTool(
      summarizeEntities,
      () => (signedIn ? countUser : undefined),
      query,
    ),
    input,
  );

test("a count naming no webs is limited to the user's own and org webs, and returns each type by count with its title and each web named", async () => {
  const summarize = vi.fn<SummarizeEntities>(() =>
    Promise.resolve(
      summary({
        count: 1500,
        typeIds: { [customerTypeId]: 100, [salesOrderTypeId]: 1400 },
        typeTitles: { [salesOrderTypeId]: "Sales Order" },
        webIds: {
          ["alice-web" as HashWebReadUser["accountId"]]: 1500,
        },
      }),
    ),
  );
  await expect(count(summarize, {})).resolves.toEqual({
    count: 1500,
    webScope: "default",
    entityTypes: [
      { entityTypeId: salesOrderTypeId, title: "Sales Order", count: 1400 },
      { entityTypeId: customerTypeId, count: 100 },
    ],
    webs: [
      {
        webId: "alice-web",
        kind: "user",
        shortname: "alice",
        name: "Alice",
        count: 1500,
      },
      {
        webId: "acme-web",
        kind: "organization",
        shortname: "acme",
        name: "Acme",
        count: 0,
      },
    ],
  });
  expect(summarize).toHaveBeenCalledTimes(1);
  expect(summarize).toHaveBeenCalledWith(
    {
      filter: {
        all: [{ any: [webIs("alice-web"), webIs("acme-web")] }, ...notArchived],
      },
      temporalAxes: hashEntityReadRequest({}, readerWebs).temporalAxes,
      ...countFlags,
    },
    expect.any(AbortSignal),
  );
});

test("a count naming webs counts in exactly those, naming those the user's own or org webs and others by id", async () => {
  const summarize = vi.fn<SummarizeEntities>(() =>
    Promise.resolve(summary({ count: 0, typeIds: {}, webIds: {} })),
  );
  await expect(
    count(summarize, { webIds: ["acme-web", "hash-web"] }),
  ).resolves.toEqual({
    count: 0,
    webScope: "named",
    entityTypes: [],
    webs: [
      {
        webId: "acme-web",
        kind: "organization",
        shortname: "acme",
        name: "Acme",
        count: 0,
      },
      { webId: "hash-web", count: 0 },
    ],
  });
  expect(summarize).toHaveBeenCalledWith(
    expect.objectContaining({
      filter: {
        all: [{ any: [webIs("acme-web"), webIs("hash-web")] }, ...notArchived],
      },
    }),
    expect.any(AbortSignal),
  );
});

test("a count settles { error } when its query fails, when the graph returns no count, or when it has no web to count in", async () => {
  await expect(
    count(
      () => Promise.reject(new Error("Response not successful: GraphQL error")),
      {},
    ),
  ).resolves.toEqual({ error: "Response not successful: GraphQL error" });
  await expect(
    count(() => Promise.resolve(summary({ typeIds: {} })), {}),
  ).resolves.toEqual({
    error: "HASH's graph returned a summary without a count.",
  });
  const summarize = vi.fn<SummarizeEntities>();
  await expect(count(summarize, {}, { signedIn: false })).resolves.toEqual({
    error: "No user is signed in to HASH.",
  });
  expect(summarize).not.toHaveBeenCalled();
});

test("a count the agent's contract doesn't allow is refused before any query", async () => {
  const summarize = vi.fn<SummarizeEntities>();
  await expect(
    count(summarize, {
      entityTypes: ["https://hash.ai/@acme/types/entity-type/sales-order/"],
    }),
  ).rejects.toThrow(/needs its version/u);
  await expect(count(summarize, { traversalDepth: 0 })).rejects.toThrow();
  expect(summarize).not.toHaveBeenCalled();
});

/** A graph entity as a count by links reads it: named where it has a name. */
const joinVertex = (
  entityId: string,
  name?: string,
  linkData?: { leftEntityId: string; rightEntityId: string },
) => ({
  [entityId]: {
    "2026-10-26T00:00:00Z": entity({
      entityId,
      editionId: `${entityId}-edition`,
      properties: name === undefined ? {} : { [nameUrl]: name },
      ...(linkData === undefined ? {} : { linkData }),
    }),
  },
});

/** One page of the given entities, with the graph's cursor when more follow. */
const joinPage = (
  vertices: Record<string, unknown>[],
  cursor?: EntityQueryCursor,
) =>
  ({
    queryEntitySubgraph: {
      ...response.queryEntitySubgraph,
      definitions: { dataTypes: {}, entityTypes: {}, propertyTypes: {} },
      subgraph: {
        roots: vertices.flatMap(Object.keys).map((baseId) => ({
          baseId,
          revisionId: "2026-10-26T00:00:00Z",
        })),
        vertices: Object.assign({}, ...vertices),
        edges: {},
        temporalAxes: {},
      },
      ...(cursor === undefined ? {} : { cursor }),
    },
  }) as unknown as QueryEntitySubgraphQuery;

/**
 * Sales orders in acme-web: o1 with nothing delivered, o2 partly and o3
 * fully; o1 and o2 for customer c1, o2 also for c2.
 */
const joinData: Record<string, Record<string, unknown>[]> = {
  "Sales Order": [
    joinVertex("acme-web~o1", "SO-1"),
    joinVertex("acme-web~o2", "SO-2"),
    joinVertex("acme-web~o3", "SO-3"),
  ],
  "Has Line Item": [
    ["o1", "i1"],
    ["o2", "i2"],
    ["o2", "i3"],
    ["o3", "i4"],
  ].map(([order, item]) =>
    joinVertex(`acme-web~l-${item}`, undefined, {
      leftEntityId: `acme-web~${order}`,
      rightEntityId: `acme-web~${item}`,
    }),
  ),
  Fulfills: ["i2", "i4"].map((item) =>
    joinVertex(`acme-web~f-${item}`, undefined, {
      leftEntityId: `acme-web~d-${item}`,
      rightEntityId: `acme-web~${item}`,
    }),
  ),
  "Has Customer": [
    ["o1", "c1"],
    ["o2", "c1"],
    ["o2", "c2"],
  ].map(([order, customer]) =>
    joinVertex(`acme-web~h-${order}-${customer}`, undefined, {
      leftEntityId: `acme-web~${order}`,
      rightEntityId: `acme-web~${customer}`,
    }),
  ),
  ids: [joinVertex("acme-web~c1", "Acme"), joinVertex("acme-web~c2", "Globex")],
};

/**
 * The graph over `joinData`: each request's type title picks the records,
 * else it is a read by id; pages hold two, so reads span pages.
 */
const joinQuery = (fails?: { title: string; page: number }) => {
  const pages = new Map<string, number>();
  return vi.fn<QueryEntitySubgraph>((request) => {
    const filter = JSON.stringify(request.filter);
    const title =
      Object.keys(joinData).find((key) =>
        filter.includes(`{"parameter":"${key}"}`),
      ) ?? "ids";
    const page = (pages.get(title) ?? 0) + 1;
    pages.set(title, page);
    if (fails?.title === title && fails.page === page) {
      return Promise.reject(new Error("HASH didn't respond in time."));
    }
    const start = Number(
      (request.cursor as unknown as [string] | undefined)?.[0] ?? 0,
    );
    // A read by id names each entity's uuid.
    const records = joinData[title]!.filter(
      (vertex) =>
        title !== "ids" ||
        filter.includes(`"${Object.keys(vertex)[0]!.split("~")[1]}"`),
    );
    const end = start + 2;
    return Promise.resolve(
      joinPage(
        records.slice(start, end),
        end < records.length
          ? ([String(end)] as unknown as EntityQueryCursor)
          : undefined,
      ),
    );
  });
};

const joinSizes = vi.fn<SummarizeEntities>((request) => {
  const filter = JSON.stringify(request.filter);
  const title = Object.keys(joinData).find((key) =>
    filter.includes(`{"parameter":"${key}"}`),
  );
  return Promise.resolve(
    summary({ count: title === undefined ? 0 : joinData[title]!.length }),
  );
});

const openOrder = [{ property: orderNumberUrl, value: "1000000283" }];
const undeliveredByCustomer = {
  entityTypes: ["Sales Order"],
  propertyEquals: openOrder,
  where: {
    path: [
      { linkType: "Has Line Item", direction: "outgoing" },
      { linkType: "Fulfills", direction: "incoming" },
    ],
    exists: false,
  },
  groupBy: { linkType: "Has Customer", direction: "outgoing" },
};

test("a count by links reads every page of the counted type and of each link type in the count's webs, with no traversal or drafts, and joins them", async () => {
  const query = joinQuery();
  const output = await count(joinSizes, undeliveredByCustomer, { query });
  expect(output).toEqual({
    outcome: "counted",
    webScope: "default",
    ofType: 3,
    count: 1,
    groups: [
      {
        entity: { entityId: "acme-web~c1", label: "Acme" },
        count: 1,
      },
    ],
    examples: [{ entityId: "acme-web~o1", label: "SO-1" }],
    reads: [
      { role: "counted", entityTypes: ["Sales Order"], entities: 3 },
      { role: "link", entityTypes: ["Has Line Item"], entities: 4 },
      { role: "link", entityTypes: ["Fulfills"], entities: 2 },
      { role: "link", entityTypes: ["Has Customer"], entities: 3 },
      { role: "grouped", entityTypes: [], entities: 1 },
    ],
    // 4 sizes, then 2 + 2 + 1 + 2 pages and 1 page of the grouped customer.
    requests: 12,
  });

  const scoped = { any: [webIs("alice-web"), webIs("acme-web")] };
  for (const [request] of query.mock.calls) {
    expect(request).toMatchObject({
      traversalPaths: [],
      includeDrafts: false,
      limit: 1000,
    });
    expect(request.filter).toMatchObject({
      all: expect.arrayContaining([scoped, ...notArchived]),
    });
  }
  // propertyEquals narrows the counted entities, not the links.
  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(
      {
        entityTypes: ["Sales Order"],
        propertyEquals: openOrder,
        traversalDepth: 0,
        limit: 1000,
      },
      ["alice-web", "acme-web"],
    ),
    expect.any(AbortSignal),
  );
  expect(query).toHaveBeenCalledWith(
    hashEntityReadRequest(
      { entityTypes: ["Has Line Item"], traversalDepth: 0, limit: 1000 },
      ["alice-web", "acme-web"],
      ["2"] as unknown as EntityQueryCursor,
    ),
    expect.any(AbortSignal),
  );
  // The sizes come first, by the same filters, with the plain count's request.
  expect(joinSizes).toHaveBeenCalledWith(
    hashEntityCountRequest(
      { entityTypes: ["Sales Order"], propertyEquals: openOrder },
      ["alice-web", "acme-web"],
    ),
    expect.any(AbortSignal),
  );
  expect(joinSizes).toHaveBeenCalledWith(
    hashEntityCountRequest({ entityTypes: ["Fulfills"] }, [
      "alice-web",
      "acme-web",
    ]),
    expect.any(AbortSignal),
  );
});

test("a count by links whose page fails settles incomplete, with no count", async () => {
  const output = await count(joinSizes, undeliveredByCustomer, {
    query: joinQuery({ title: "Has Line Item", page: 2 }),
  });
  expect(output).toMatchObject({
    outcome: "incomplete",
    reason:
      "Reading the Has Line Item links failed on page 2: HASH didn't respond in time.",
  });
  expect(output).not.toHaveProperty("count");
});

test("a count by links settles { error } when sizing it fails, and a plain count never reads pages", async () => {
  await expect(
    count(
      () => Promise.reject(new Error("Response not successful")),
      undeliveredByCustomer,
      { query: joinQuery() },
    ),
  ).resolves.toEqual({ error: "Response not successful" });
  const query = joinQuery();
  await count(joinSizes, { entityTypes: ["Sales Order"] }, { query });
  expect(query).not.toHaveBeenCalled();
});
