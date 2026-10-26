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
} from "../../../../graphql/api-types.gen";
import type {
  PetrinautAiAutomaticTool,
  PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/brunch-agent/ui";

const notArchived = { equal: [{ path: ["archived"] }, { parameter: false }] };
const edgesTo = (depth: number) => [
  {
    edges: Array.from({ length: depth }, () => [
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ]).flat(),
  },
  {
    edges: Array.from({ length: depth }, () => [
      { kind: "has-right-entity", direction: "incoming" },
      { kind: "has-left-entity", direction: "outgoing" },
    ]).flat(),
  },
];

test("a read with no filters asks for every visible, unarchived entity one link deep, without drafts", () => {
  expect(hashEntityReadRequest({})).toMatchObject({
    filter: { all: [notArchived] },
    traversalPaths: edgesTo(1),
    includeDrafts: false,
    includePermissions: false,
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
              { equal: [{ path: ["webId"] }, { parameter: "alice-web" }] },
              { equal: [{ path: ["uuid"] }, { parameter: "supplier" }] },
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
      notArchived,
    ],
  });
  expect(request.includeDrafts).toBe(true);
});

test("traversal depth follows the input, from none up to a cap of five", () => {
  expect(hashEntityReadRequest({ traversalDepth: 0 }).traversalPaths).toEqual(
    [],
  );
  expect(hashEntityReadRequest({ traversalDepth: 3 }).traversalPaths).toEqual(
    edgesTo(3),
  );
  expect(hashEntityReadRequest({ traversalDepth: 9 }).traversalPaths).toEqual(
    edgesTo(5),
  );
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
/** Alice's supplier, matched, and the link the traversal reached from it. */
const response = {
  queryEntitySubgraph: {
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
} as unknown as QueryEntitySubgraphQuery;

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
    entities: [
      {
        entityId: "alice-web~supplier",
        editionId: "edition-2",
        webId: "alice-web",
        entityTypeIds: [
          "https://hash.ai/@alice/types/entity-type/supplier/v/1",
        ],
        properties: { [nameUrl]: "Acme Parts" },
        draft: false,
        matched: true,
      },
      {
        entityId: "alice-web~link",
        editionId: "edition-7",
        webId: "alice-web",
        entityTypeIds: ["https://hash.ai/@h/types/entity-type/has/v/1"],
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

test("an input the agent's contract doesn't allow is refused before any query", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(run(query, { entityTypes: "Supplier" })).rejects.toThrow();
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

test("a web read with input the agent's contract doesn't allow is refused", async () => {
  await expect(
    runTool(
      createHashWebReadTool(() => alice),
      { webIds: [] },
    ),
  ).rejects.toThrow();
});
