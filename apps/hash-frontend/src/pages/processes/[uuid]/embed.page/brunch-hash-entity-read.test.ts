import { expect, test, vi } from "vitest";

import {
  createHashEntityReadTool,
  hashEntityReadRequest,
  type QueryEntitySubgraph,
} from "./brunch-hash-entity-read";

import type { QueryEntitySubgraphQuery } from "../../../../graphql/api-types.gen";
import type { PetrinautAiAutomaticToolExecuteParams } from "@hashintel/brunch-agent/ui";

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

const run = (query: QueryEntitySubgraph, input: unknown) =>
  createHashEntityReadTool(query).execute({
    input,
    toolCallId: "read",
    signal: new AbortController().signal,
  } as PetrinautAiAutomaticToolExecuteParams);

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

test("a failed query rejects, so the call settles as a failed read", async () => {
  const graphQlError = new Error("Response not successful: GraphQL error");
  await expect(run(() => Promise.reject(graphQlError), {})).rejects.toBe(
    graphQlError,
  );
});

test("an input the agent's contract doesn't allow is refused before any query", async () => {
  const query = vi.fn<QueryEntitySubgraph>(() => Promise.resolve(response));
  await expect(run(query, { entityTypes: "Supplier" })).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
