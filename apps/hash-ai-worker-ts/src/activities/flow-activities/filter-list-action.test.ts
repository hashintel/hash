import { describe, expect, it, vi } from "vitest";

import {
  resolvePayloadValue,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { filterListAction } from "./filter-list-action.js";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type { FilterCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type {
  Payload,
  ProposedEntity,
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
      runId: "run",
      stepId: "filter",
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

const run = (items: Payload, condition: FilterCondition) =>
  filterListAction({
    inputs: [
      { inputName: "items", payload: items },
      {
        inputName: "condition",
        payload: { kind: "FilterCondition", value: condition },
      },
    ] satisfies StepInput[],
  });

const outputValues = async (result: Awaited<ReturnType<typeof run>>) =>
  Object.fromEntries(
    await Promise.all(
      (result.contents[0]?.outputs ?? []).map(
        async ({ outputName, payload }): Promise<[string, unknown]> => [
          outputName,
          await resolvePayloadValue(
            { storageProvider, workflowId },
            payload.kind,
            payload.value,
          ),
        ],
      ),
    ),
  );

describe("filterListAction", () => {
  it("splits a stored list into stored matching and non-matching lists", async () => {
    const entities = ["A", "B", "A", "C"].map(
      (summary, index) =>
        ({ summary, localEntityId: `entity-${index}` }) as ProposedEntity,
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
        kind: "all",
        conditions: [
          {
            kind: "condition",
            subject: { kind: "field", path: ["summary"], payloadKind: "Text" },
            operator: "equals",
            value: { kind: "Text", value: "A" },
          },
        ],
      },
    );

    expect(result.contents[0]?.outputs).toMatchObject([
      { outputName: "matching", payload: { value: { __stored: true } } },
      { outputName: "nonMatching", payload: { value: { __stored: true } } },
    ]);
    expect(await outputValues(result)).toEqual({
      matching: [entities[0], entities[2]],
      nonMatching: [entities[1], entities[3]],
    });
  });

  it("fetches the entities a condition reads in one query", async () => {
    const companyType =
      "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
    const entityIds = [1, 2, 3].map(
      (index) =>
        `00000000-0000-4000-8000-00000000000${index}~00000000-0000-4000-8000-00000000001${index}` as EntityId,
    );
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: entityIds.map((entityId, index) => ({
        properties: {},
        metadata: {
          recordId: { entityId },
          entityTypeIds: [
            index === 1
              ? ("https://example.com/types/entity-type/person/v/1" as VersionedUrl)
              : companyType,
          ],
        },
      })),
    } as unknown as Awaited<ReturnType<typeof queryEntities>>);

    const result = await run(
      { kind: "EntityId", value: entityIds },
      {
        kind: "all",
        conditions: [
          {
            kind: "condition",
            subject: { kind: "entityType" },
            operator: "isOfType",
            value: { kind: "VersionedUrl", value: companyType },
          },
        ],
      },
    );

    expect(queryEntities).toHaveBeenCalledOnce();
    expect(await outputValues(result)).toEqual({
      matching: [entityIds[0], entityIds[2]],
      nonMatching: [entityIds[1]],
    });
  });

  const companyType =
    "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
  const isCompany: FilterCondition = {
    kind: "all",
    conditions: [
      {
        kind: "condition",
        subject: { kind: "entityType" },
        operator: "isOfType",
        value: { kind: "VersionedUrl", value: companyType },
      },
    ],
  };
  const webId = "00000000-0000-4000-8000-000000000001";
  const entityUuid = "00000000-0000-4000-8000-000000000011";
  const validEntityId = `${webId}~${entityUuid}` as EntityId;

  it("queries only well-formed EntityIds and fails on a malformed one", async () => {
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [
        {
          properties: {},
          metadata: {
            recordId: { entityId: validEntityId },
            entityTypeIds: [companyType],
          },
        },
      ],
    } as unknown as QueryEntitiesResponse);

    const result = await run(
      {
        kind: "EntityId",
        value: [validEntityId, "" as EntityId, "not-an-entity-id" as EntityId],
      },
      isCompany,
    );

    expect(vi.mocked(queryEntities).mock.lastCall?.[2].filter).toEqual({
      any: [
        {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { not: { exists: { path: ["draftId"] } } },
          ],
        },
      ],
    });
    expect(result).toEqual({
      code: StatusCode.InvalidArgument,
      message: "not-an-entity-id is not a valid EntityId.",
      contents: [],
    });
  });

  it("evaluates a draft and the live entity against their own editions", async () => {
    const draftId = "00000000-0000-4000-8000-000000000099";
    const draftEntityId = `${validEntityId}~${draftId}` as EntityId;

    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [
        {
          properties: {},
          metadata: {
            recordId: { entityId: validEntityId },
            entityTypeIds: [companyType],
          },
        },
        {
          properties: {},
          metadata: {
            recordId: { entityId: draftEntityId },
            entityTypeIds: ["https://example.com/types/entity-type/person/v/1"],
          },
        },
      ],
    } as unknown as QueryEntitiesResponse);

    const result = await run(
      { kind: "EntityId", value: [validEntityId, draftEntityId] },
      isCompany,
    );

    expect(vi.mocked(queryEntities).mock.lastCall?.[2].filter).toEqual({
      any: [
        {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { not: { exists: { path: ["draftId"] } } },
          ],
        },
        {
          all: [
            { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { equal: [{ path: ["draftId"] }, { parameter: draftId }] },
          ],
        },
      ],
    });
    expect(await outputValues(result)).toEqual({
      matching: [validEntityId],
      nonMatching: [draftEntityId],
    });
  });

  it("loads the entities from every page of the query", async () => {
    const draftEntityId =
      `${validEntityId}~00000000-0000-4000-8000-000000000099` as EntityId;
    const page = (entityId: EntityId, cursor?: string) =>
      ({
        entities: [
          {
            properties: {},
            metadata: {
              recordId: { entityId },
              entityTypeIds: [companyType],
            },
          },
        ],
        cursor,
      }) as unknown as QueryEntitiesResponse;

    vi.mocked(queryEntities)
      .mockClear()
      .mockResolvedValueOnce(page(validEntityId, "next-page"))
      .mockResolvedValueOnce(page(draftEntityId));

    const result = await run(
      { kind: "EntityId", value: [validEntityId, draftEntityId] },
      isCompany,
    );

    expect(vi.mocked(queryEntities).mock.calls[1]?.[2].cursor).toBe(
      "next-page",
    );
    expect(await outputValues(result)).toEqual({
      matching: [validEntityId, draftEntityId],
      nonMatching: [],
    });
  });

  it("fails instead of loading more entities than a condition can read", async () => {
    vi.mocked(queryEntities).mockClear();
    const entityIds = Array.from(
      { length: 100_001 },
      (_, index) =>
        `${webId}~00000000-0000-4000-8000-${index.toString().padStart(12, "0")}` as EntityId,
    );

    await expect(
      run({ kind: "EntityId", value: entityIds }, isCompany),
    ).rejects.toThrow("at most 100000 entities");
    expect(queryEntities).not.toHaveBeenCalled();
  });

  it("reports an entity the user can't read as not found", async () => {
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [],
    } as unknown as QueryEntitiesResponse);

    expect(
      await run({ kind: "EntityId", value: [validEntityId] }, isCompany),
    ).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${validEntityId} wasn't found or you don't have access to it.`,
      contents: [],
    });
  });
});
