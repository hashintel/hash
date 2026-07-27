import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@local/hash-graph-sdk/entity", () => ({
  queryEntitySubgraph: vi.fn(),
}));

import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";

import { queryAllEntitySubgraphPages } from "./query-all-entity-subgraph-pages.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { QueryEntitySubgraphRequest } from "@local/hash-graph-sdk/entity";

const mockedQueryEntitySubgraph = vi.mocked(queryEntitySubgraph);

const graphApi = {} as GraphApi;
const authentication = {
  actorId: "00000000-0000-4000-8000-000000000001" as ActorEntityUuid,
};

const page = ({
  cursor,
  rootBaseId,
  sharedRevision,
}: {
  cursor?: string;
  rootBaseId: string;
  sharedRevision: string;
}) =>
  ({
    cursor,
    subgraph: {
      roots: [{ baseId: rootBaseId, revisionId: "1" }],
      vertices: {
        [rootBaseId]: { "1": { inner: { id: rootBaseId } } },
        shared: { [sharedRevision]: { inner: { id: "shared" } } },
      },
      edges: {
        shared: { [sharedRevision]: { kind: "shared-edge" } },
      },
      temporalAxes: {},
    },
  }) as unknown as Awaited<ReturnType<typeof queryEntitySubgraph>>;

describe("queryAllEntitySubgraphPages", () => {
  beforeEach(() => {
    mockedQueryEntitySubgraph.mockReset();
  });

  it("follows cursors and merges roots, vertices, and edge revisions", async () => {
    mockedQueryEntitySubgraph
      .mockResolvedValueOnce(
        page({
          cursor: "next-page",
          rootBaseId: "root-1",
          sharedRevision: "1",
        }),
      )
      .mockResolvedValueOnce(
        page({ rootBaseId: "root-2", sharedRevision: "2" }),
      );

    const subgraph = await queryAllEntitySubgraphPages(
      { graphApi },
      authentication,
      { filter: { all: [] } } as unknown as QueryEntitySubgraphRequest,
    );

    expect(mockedQueryEntitySubgraph).toHaveBeenCalledTimes(2);
    expect(mockedQueryEntitySubgraph.mock.calls[0]![2]).toMatchObject({
      cursor: undefined,
    });
    expect(mockedQueryEntitySubgraph.mock.calls[1]![2]).toMatchObject({
      cursor: "next-page",
    });
    expect(subgraph.roots).toHaveLength(2);
    expect(Object.keys(subgraph.vertices)).toEqual([
      "root-1",
      "shared",
      "root-2",
    ]);
    expect(Object.keys(subgraph.vertices.shared!)).toEqual(["1", "2"]);
    expect(Object.keys(subgraph.edges.shared!)).toEqual(["1", "2"]);
  });
});
