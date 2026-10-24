import { describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { aggregateAction } from "./aggregate-action.js";

import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type { Aggregation } from "@local/hash-isomorphic-utils/flows/aggregation";
import type {
  Payload,
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const workflowId = "workflow";
const objects = new Map<string, string>();
const downloadDirect = vi.fn(({ key }: { key: string }) =>
  Promise.resolve(Buffer.from(objects.get(key) ?? "null")),
);
const storageProvider = {
  uploadDirect: ({ key, body }: { key: string; body: string }) => {
    objects.set(key, body);
    return Promise.resolve();
  },
  downloadDirect,
} as unknown as FileStorageProvider;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      workflowId,
      runId: "run",
      stepId: "aggregate",
      userAuthentication: { actorId: "user" },
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

const run = (items: Payload, aggregation: Aggregation) =>
  aggregateAction({
    inputs: [
      { inputName: "items", payload: items },
      {
        inputName: "aggregation",
        payload: { kind: "Aggregation", value: aggregation },
      },
    ] satisfies StepInput[],
  });

const scoreUrl = "https://example.com/property-type/score/" as BaseUrl;

const storedEntities = async (scores: number[]): Promise<Payload> => ({
  kind: "ProposedEntity",
  value: await storePayload({
    storageProvider,
    workflowId,
    runId: "run",
    stepId: "propose",
    outputName: "proposedEntities",
    kind: "ProposedEntity",
    value: scores.map(
      (score, index) =>
        ({
          localEntityId: `entity-${index}`,
          properties: { [scoreUrl]: score },
          entityTypeIds: [],
        }) as unknown as ProposedEntity,
    ),
  }),
});

const scoreSum: Aggregation = {
  operation: "sum",
  subject: {
    kind: "entityProperty",
    propertyTypeBaseUrl: scoreUrl,
    payloadKind: "Number",
  },
};

describe("aggregateAction", () => {
  it("counts a stored list without fetching it", async () => {
    const items = await storedEntities([1, 2, 3]);
    downloadDirect.mockClear();

    expect((await run(items, { operation: "count" })).contents).toEqual([
      {
        outputs: [
          { outputName: "result", payload: { kind: "Number", value: 3 } },
        ],
      },
    ]);
    expect(downloadDirect).not.toHaveBeenCalled();
  });

  it("counts an empty list as 0, rather than giving no result", async () => {
    expect(
      (await run({ kind: "Number", value: [] }, { operation: "count" }))
        .contents,
    ).toEqual([
      {
        outputs: [
          { outputName: "result", payload: { kind: "Number", value: 0 } },
        ],
      },
    ]);
  });

  it("sums a stored list", async () => {
    expect(
      (await run(await storedEntities([5, 9, 7]), scoreSum)).contents,
    ).toEqual([
      {
        outputs: [
          { outputName: "result", payload: { kind: "Number", value: 21 } },
        ],
      },
    ]);
  });

  it("gives no result for the average of no values", async () => {
    expect(
      await run(
        { kind: "Number", value: [] },
        {
          operation: "average",
          subject: { kind: "input", payloadKind: "Number" },
        },
      ),
    ).toMatchObject({ code: StatusCode.Ok, contents: [{ outputs: [] }] });
  });

  const entityIds = [1, 2, 3].map(
    (index) =>
      `00000000-0000-4000-8000-00000000000${index}~00000000-0000-4000-8000-00000000001${index}` as EntityId,
  );

  it("fetches the entities it reads in one query", async () => {
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: entityIds.map((entityId, index) => ({
        properties: { [scoreUrl]: [5, 9, 7][index] },
        metadata: { recordId: { entityId }, entityTypeIds: [] },
      })),
    } as unknown as QueryEntitiesResponse);

    const result = await run(
      { kind: "EntityId", value: entityIds },
      { ...scoreSum, operation: "max" },
    );

    expect(queryEntities).toHaveBeenCalledOnce();
    expect(result.contents[0]?.outputs[0]?.payload).toEqual({
      kind: "Number",
      value: 9,
    });
  });

  it("reports an entity the user can't read as not found", async () => {
    const entityId =
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000011" as EntityId;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [],
    });

    expect(
      await run({ kind: "EntityId", value: [entityId] }, scoreSum),
    ).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${entityId} wasn't found or you don't have access to it.`,
      contents: [],
    });
  });

  it("rejects an aggregation from an earlier step that doesn't fit the items, without reading them", async () => {
    const items = await storedEntities([1]);
    downloadDirect.mockClear();

    expect(
      await run(items, {
        operation: "sum",
        subject: { kind: "input", payloadKind: "Number" },
      }),
    ).toMatchObject({ code: StatusCode.InvalidArgument, contents: [] });
    expect(downloadDirect).not.toHaveBeenCalled();
  });
});
