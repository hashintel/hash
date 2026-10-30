import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  resolvePayloadValue,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { createProposedEntity } from "../../shared/testing-utilities/create-proposed-entity.js";
import { orderByAction } from "./order-by-action.js";

import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type { SortKey } from "@local/hash-isomorphic-utils/flows/sort-key";
import type {
  Payload,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

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
      stepId: "order",
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

const run = (items: Payload, sortBy: SortKey) =>
  orderByAction({
    inputs: [
      { inputName: "items", payload: items },
      { inputName: "sortBy", payload: { kind: "SortKey", value: sortBy } },
    ] satisfies StepInput[],
  });

const resolveOutput = async (result: Awaited<ReturnType<typeof run>>) => {
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

const scoreUrl = "https://example.com/property-type/score/" as BaseUrl;
const byScore: SortKey = {
  subject: {
    kind: "entityProperty",
    propertyTypeBaseUrl: scoreUrl,
    payloadKind: "Number",
  },
  direction: "descending",
};

describe("orderByAction", () => {
  it("sorts a stored list into a stored list", async () => {
    const entities = ["B", "C", "A"].map((summary, index) =>
      createProposedEntity({
        summary,
        localEntityId: `entity-${index}`,
      }),
    );

    const result = await run(
      {
        kind: "ProposedEntity",
        value: await storePayload({
          storageProvider,
          workflowId,
          runId: "run",
          stepId: "propose",
          outputName: "proposedEntities",
          kind: "ProposedEntity",
          value: entities,
        }),
      },
      {
        subject: { kind: "field", path: ["summary"], payloadKind: "Text" },
        direction: "ascending",
      },
    );

    expect(result.contents[0]?.outputs).toMatchObject([
      { outputName: "items", payload: { value: { __stored: true } } },
    ]);
    expect(await resolveOutput(result)).toEqual([
      entities[2],
      entities[0],
      entities[1],
    ]);
  });

  const entityIds = [1, 2, 3].map(
    (index) =>
      `00000000-0000-4000-8000-00000000000${index}~00000000-0000-4000-8000-00000000001${index}` as EntityId,
  );

  it("fetches the entities it sorts by in one query", async () => {
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: entityIds.map((entityId, index) => ({
        properties: { [scoreUrl]: [5, 9, 7][index] },
        metadata: { recordId: { entityId }, entityTypeIds: [] },
      })),
    } as unknown as QueryEntitiesResponse);

    const result = await run({ kind: "EntityId", value: entityIds }, byScore);

    expect(queryEntities).toHaveBeenCalledOnce();
    expect(await resolveOutput(result)).toEqual([
      entityIds[1],
      entityIds[2],
      entityIds[0],
    ]);
  });

  it("reports an entity the user can't read as not found", async () => {
    const entityId =
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000011" as EntityId;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [],
    } as unknown as QueryEntitiesResponse);

    expect(await run({ kind: "EntityId", value: [entityId] }, byScore)).toEqual(
      {
        code: StatusCode.NotFound,
        message: `Entity ${entityId} wasn't found or you don't have access to it.`,
        contents: [],
      },
    );
  });

  it("rejects a sort key from an earlier step that doesn't fit the items", async () => {
    expect(await run({ kind: "Number", value: [2, 1] }, byScore)).toMatchObject(
      { code: StatusCode.InvalidArgument, contents: [] },
    );
  });
});
