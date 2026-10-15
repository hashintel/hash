import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryEntities } from "@local/hash-graph-sdk/entity";
import { maxQueryEntities } from "@local/hash-isomorphic-utils/flows/query-entities";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { queryEntitiesAction } from "./query-entities-action.js";

import type { BaseUrl, EntityId, WebId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type { FilterCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { SortKey } from "@local/hash-isomorphic-utils/flows/sort-key";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";

const webId = "00000000-0000-4000-8000-000000000001" as WebId;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      workflowId: "workflow",
      runId: "run",
      stepId: "query",
      userAuthentication: { actorId: "user" },
      webId,
    }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => ({}),
  }),
);
vi.mock("@local/hash-graph-sdk/entity", () => ({ queryEntities: vi.fn() }));

const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const scoreUrl = "https://example.com/types/property-type/score/" as BaseUrl;

const isAcme: FilterCondition = {
  kind: "any",
  conditions: [
    {
      kind: "condition",
      subject: {
        kind: "entityProperty",
        propertyTypeBaseUrl: nameUrl,
        payloadKind: "Text",
      },
      operator: "startsWith",
      value: { kind: "Text", value: "Acme" },
    },
  ],
};

const by = (
  propertyTypeBaseUrl: BaseUrl,
  payloadKind: "Text" | "Number",
  direction: SortKey["direction"],
): SortKey => ({
  subject: { kind: "entityProperty", propertyTypeBaseUrl, payloadKind },
  direction,
});

const run = (params: { sort?: SortKey[]; limit?: number } = {}) =>
  queryEntitiesAction({
    inputs: [
      {
        inputName: "filter",
        payload: { kind: "FilterCondition", value: isAcme },
      },
      ...(params.sort
        ? [
            {
              inputName: "sort",
              payload: { kind: "SortKey" as const, value: params.sort },
            },
          ]
        : []),
      ...(params.limit === undefined
        ? []
        : [
            {
              inputName: "limit",
              payload: { kind: "Number" as const, value: params.limit },
            },
          ]),
    ] satisfies StepInput[],
  });

const entityIdOf = (index: number) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as EntityId;

/** Answers each query with the next page, each with a cursor but the last. */
const mockPages = (...pages: Record<string, unknown>[][]) => {
  let offset = 0;
  for (const [pageIndex, page] of pages.entries()) {
    const firstIndex = offset;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: page.map((properties, index) => ({
        properties,
        metadata: {
          recordId: { entityId: entityIdOf(firstIndex + index) },
          entityTypeIds: [],
        },
      })),
      cursor: pageIndex < pages.length - 1 ? [{ page: pageIndex }] : null,
    } as unknown as QueryEntitiesResponse);
    offset += page.length;
  }
};

const outputOf = (result: Awaited<ReturnType<typeof run>>) =>
  result.contents[0]?.outputs[0]?.payload.value;

describe("queryEntitiesAction", () => {
  beforeEach(() => {
    vi.mocked(queryEntities).mockReset();
  });

  it("queries the latest live entities of the web, outside any branch of the filter", async () => {
    mockPages([]);

    await run();

    const [[, authentication, request] = []] =
      vi.mocked(queryEntities).mock.calls;
    expect(authentication).toEqual({ actorId: "user" });
    expect(request).toMatchObject({
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
    });

    const { all: [webScope, scoped] = [] } = request?.filter as {
      all?: Filter[];
    };
    expect(webScope).toEqual({
      equal: [{ path: ["webId"] }, { parameter: webId }],
    });
    expect(scoped).toMatchObject({
      all: [
        { equal: [{ path: ["archived"] }, { parameter: false }] },
        { any: [expect.anything()] },
      ],
    });
  });

  it("returns an empty list when nothing matches", async () => {
    mockPages([]);

    const result = await run();

    expect(result.code).toBe(StatusCode.Ok);
    expect(outputOf(result)).toEqual([]);
  });

  it("reads every page", async () => {
    mockPages([{}, {}], [{}, {}], [{}]);

    const result = await run();

    expect(
      vi.mocked(queryEntities).mock.calls.map(([, , { cursor }]) => cursor),
    ).toEqual([undefined, [{ page: 0 }], [{ page: 1 }]]);
    expect(outputOf(result)).toEqual([0, 1, 2, 3, 4].map(entityIdOf));
  });

  it("stops reading once it has the first entities up to the limit", async () => {
    mockPages([{}, {}], [{}, {}], [{}]);

    const result = await run({ limit: 3 });

    expect(queryEntities).toHaveBeenCalledTimes(2);
    expect(outputOf(result)).toEqual([0, 1, 2].map(entityIdOf));
  });

  it("sorts every match by each key in turn, with missing values last, before limiting", async () => {
    mockPages(
      [
        { [nameUrl]: "Acme B", [scoreUrl]: 5 },
        { [nameUrl]: "Acme C" },
        { [nameUrl]: "Acme A", [scoreUrl]: 9 },
      ],
      [
        { [nameUrl]: "Acme D", [scoreUrl]: 9 },
        { [nameUrl]: "Acme E", [scoreUrl]: 5 },
      ],
    );

    const result = await run({
      sort: [
        by(scoreUrl, "Number", "descending"),
        by(nameUrl, "Text", "descending"),
      ],
      limit: 4,
    });

    expect(queryEntities).toHaveBeenCalledTimes(2);
    expect(outputOf(result)).toEqual([3, 2, 4, 0].map(entityIdOf));
  });

  it("fails rather than leave out entities when there are too many to read", async () => {
    mockPages(Array.from({ length: maxQueryEntities + 1 }, () => ({})));

    expect(await run()).toMatchObject({
      code: StatusCode.ResourceExhausted,
      contents: [],
    });
  });

  it("rejects a limit or sort from an earlier step that doesn't fit, without querying", async () => {
    expect(await run({ limit: maxQueryEntities + 1 })).toMatchObject({
      code: StatusCode.InvalidArgument,
    });
    expect(
      await run({
        sort: [
          {
            subject: { kind: "field", path: ["name"], payloadKind: "Text" },
            direction: "ascending",
          },
        ],
      }),
    ).toMatchObject({ code: StatusCode.InvalidArgument });
    expect(queryEntities).not.toHaveBeenCalled();
  });
});
