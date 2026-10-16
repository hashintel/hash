import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePayloadValue } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";
import { generateTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { queryEntitiesAction } from "./query-entities-action.js";

import type { EntityId, Timestamp, WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  EntityQuerySortingRecord,
  Filter,
} from "@local/hash-graph-client";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type {
  EntityQuery,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const webId = "00000000-0000-4000-8000-000000000001" as WebId;
const workflowId = "workflow";
const objects = new Map<string, string>();
const storageProvider = {
  uploadDirect: ({ key, body }: { key: string; body: string }) => {
    objects.set(key, body);
    return Promise.resolve();
  },
  downloadDirect: ({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(objects.get(key) ?? "null")),
} as unknown as FileStorageProvider;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      workflowId,
      /* A run of its own, so that outputs stored by one test aren't read back from the download cache by another. */
      runId: randomUUID(),
      stepId: "query",
      userAuthentication: { actorId: "user" },
      webId,
    }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => storageProvider,
  }),
);
vi.mock("@local/hash-graph-sdk/entity", () => ({ queryEntities: vi.fn() }));

const nameUrl = "https://example.com/types/property-type/name/";

const isAcme: Filter = {
  equal: [{ path: ["properties", nameUrl] }, { parameter: "Acme" }],
};

const oldestFirst: EntityQuerySortingRecord = {
  path: ["createdAtTransactionTime"],
  ordering: "ascending",
  nulls: "last",
};

const byUuid: EntityQuerySortingRecord = {
  path: ["uuid"],
  ordering: "ascending",
  nulls: "last",
};

const run = (query: Partial<EntityQuery> = {}) =>
  queryEntitiesAction({
    inputs: [
      {
        inputName: "query",
        payload: { kind: "EntityQuery", value: { filter: isAcme, ...query } },
      },
    ] satisfies StepInput[],
  });

const requests = () =>
  vi.mocked(queryEntities).mock.calls.map(([, , request]) => request);

const entityIdOf = (index: number) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as EntityId;

/** Answers each query with the next page of entities, each with a cursor but the last. */
const mockPages = (...pageSizes: number[]) => {
  let offset = 0;
  for (const [pageIndex, pageSize] of pageSizes.entries()) {
    const firstIndex = offset;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: Array.from({ length: pageSize }, (_, index) => ({
        metadata: { recordId: { entityId: entityIdOf(firstIndex + index) } },
      })),
      cursor: pageIndex < pageSizes.length - 1 ? [{ page: pageIndex }] : null,
    } as unknown as QueryEntitiesResponse);
    offset += pageSize;
  }
};

const outputOf = async (result: Awaited<ReturnType<typeof run>>) => {
  const output = result.contents[0]?.outputs[0];
  return (
    output &&
    resolvePayloadValue(
      { storageProvider, workflowId },
      output.payload.kind,
      output.payload.value,
    )
  );
};

describe("queryEntitiesAction", () => {
  beforeEach(() => {
    vi.mocked(queryEntities).mockReset();
  });

  it("scopes the filter to the web's live entities, outside any branch of it", async () => {
    mockPages(0);

    await run();

    const [[, authentication, request] = []] =
      vi.mocked(queryEntities).mock.calls;
    expect(authentication).toEqual({ actorId: "user" });
    expect(request?.filter).toEqual({
      all: [
        { equal: [{ path: ["webId"] }, { parameter: webId }] },
        {
          all: [
            { equal: [{ path: ["archived"] }, { parameter: false }] },
            isAcme,
          ],
        },
      ],
    });
  });

  it("defaults to the last edited first, as of one instant for every page, without drafts", async () => {
    mockPages(1, 1);

    await run();

    const [first, second] = requests();
    expect(first).toMatchObject({
      includeDrafts: false,
      sortingPaths: [
        {
          path: ["editionCreatedAtTransactionTime"],
          ordering: "descending",
          nulls: "last",
        },
        byUuid,
      ],
    });
    const { start, end } = (
      first?.temporalAxes as {
        variable: { interval: { start: unknown; end: unknown } };
      }
    ).variable.interval;
    expect(start).toMatchObject({ kind: "inclusive" });
    expect(typeof (start as { limit?: unknown }).limit).toBe("string");
    expect(end).toEqual(start);
    expect(second?.temporalAxes).toEqual(first?.temporalAxes);
  });

  it("passes the query's own sorting, temporal axes and drafts through, breaking ties by UUID", async () => {
    const temporalAxes = generateTimeInstantTemporalAxes(
      "2026-01-01T00:00:00.000Z" as Timestamp,
    );
    mockPages(0);
    mockPages(0);

    await run({
      sortingPaths: [oldestFirst],
      temporalAxes,
      includeDrafts: true,
    });
    await run({ sortingPaths: [byUuid, oldestFirst] });

    expect(requests()).toMatchObject([
      {
        sortingPaths: [oldestFirst, byUuid],
        temporalAxes,
        includeDrafts: true,
      },
      { sortingPaths: [byUuid, oldestFirst] },
    ]);
  });

  it("leaves out request fields that aren't part of a query", async () => {
    mockPages(0);

    await run({
      conversions: [],
      cursor: { page: 3 },
      includePermissions: true,
    } as Partial<EntityQuery>);

    expect(requests()[0]).toMatchObject({
      cursor: undefined,
      includePermissions: false,
    });
    expect(requests()[0]).not.toHaveProperty("conversions");
  });

  it("returns an empty list when nothing matches", async () => {
    mockPages(0);

    const result = await run();

    expect(result.code).toBe(StatusCode.Ok);
    expect(result.contents[0]?.outputs).toMatchObject([
      { outputName: "entities", payload: { value: { __stored: true } } },
    ]);
    expect(await outputOf(result)).toEqual([]);
  });

  it("reads every page, in the graph's order", async () => {
    mockPages(2, 2, 1);

    const result = await run();

    expect(requests().map(({ cursor }) => cursor)).toEqual([
      undefined,
      [{ page: 0 }],
      [{ page: 1 }],
    ]);
    expect(await outputOf(result)).toEqual([0, 1, 2, 3, 4].map(entityIdOf));
  });

  it("stops reading once it has the first entities up to the limit, without passing it to the graph", async () => {
    mockPages(2, 2, 1);

    const result = await run({ limit: 3 });

    expect(queryEntities).toHaveBeenCalledTimes(2);
    expect(requests()[0]).not.toHaveProperty("limit");
    expect(await outputOf(result)).toEqual([0, 1, 2].map(entityIdOf));
  });

  it("fails rather than leave out entities when more than it can return match without a limit", async () => {
    mockPages(maxEntitiesPerStep, 1);

    expect(await run()).toMatchObject({
      code: StatusCode.ResourceExhausted,
      contents: [],
    });
  });

  it("returns each entity once when several of its editions match, counting entities toward the limit", async () => {
    for (const [page, indices] of [
      [0, [0, 1, 0]],
      [1, [1, 2, 3]],
    ] as const) {
      vi.mocked(queryEntities).mockResolvedValueOnce({
        entities: indices.map((index) => ({
          metadata: { recordId: { entityId: entityIdOf(index) } },
        })),
        cursor: [{ page }],
      } as unknown as QueryEntitiesResponse);
    }

    const result = await run({ limit: 3 });

    expect(queryEntities).toHaveBeenCalledTimes(2);
    expect(await outputOf(result)).toEqual([0, 1, 2].map(entityIdOf));
  });

  it("rejects a query without a filter, without querying", async () => {
    expect(
      await queryEntitiesAction({
        inputs: [
          {
            inputName: "query",
            payload: { kind: "EntityQuery", value: {} as EntityQuery },
          },
        ],
      }),
    ).toMatchObject({ code: StatusCode.InvalidArgument });
    expect(queryEntities).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, maxEntitiesPerStep + 1])(
    "rejects a limit of %s without querying",
    async (limit) => {
      expect(await run({ limit })).toMatchObject({
        code: StatusCode.InvalidArgument,
      });
      expect(queryEntities).not.toHaveBeenCalled();
    },
  );
});
