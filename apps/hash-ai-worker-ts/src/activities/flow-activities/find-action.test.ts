import { describe, expect, it, vi } from "vitest";

import {
  resolvePayloadValue,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { findAction } from "./find-action.js";

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
      stepId: "find",
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

const run = (items: Payload, condition?: FilterCondition) =>
  findAction({
    inputs: [
      { inputName: "items", payload: items },
      ...(condition
        ? [
            {
              inputName: "condition",
              payload: { kind: "FilterCondition", value: condition },
            } satisfies StepInput,
          ]
        : []),
    ] satisfies StepInput[],
  });

const hasSummary = (summary: string): FilterCondition => ({
  kind: "all",
  conditions: [
    {
      kind: "condition",
      subject: { kind: "field", path: ["summary"], payloadKind: "Text" },
      operator: "equals",
      value: { kind: "Text", value: summary },
    },
  ],
});

const entities = ["A", "B", "B"].map(
  (summary, index) =>
    ({ summary, localEntityId: `entity-${index}` }) as ProposedEntity,
);

const storedEntities = async (): Promise<Payload> => ({
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
});

describe("findAction", () => {
  it("stores the first match of a stored list", async () => {
    const result = await run(await storedEntities(), hasSummary("B"));

    const output = result.contents[0]?.outputs[0];
    expect(output).toMatchObject({
      outputName: "match",
      payload: { kind: "ProposedEntity", value: { __stored: true } },
    });
    expect(
      output &&
        (await resolvePayloadValue(
          { storageProvider, workflowId },
          output.payload.kind,
          output.payload.value,
        )),
    ).toEqual(entities[1]);
  });

  it("returns the first item when there is no condition", async () => {
    expect(
      (await run({ kind: "Text", value: ["first", "second"] })).contents,
    ).toEqual([
      {
        outputs: [
          { outputName: "match", payload: { kind: "Text", value: "first" } },
        ],
      },
    ]);
  });

  it("returns no outputs when no item matches", async () => {
    expect(await run(await storedEntities(), hasSummary("C"))).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [] }],
    });
  });

  it("returns no outputs for an empty list without a condition", async () => {
    expect(await run({ kind: "Text", value: [] })).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [] }],
    });
  });

  it("reports an entity the user can't read as not found", async () => {
    const entityId =
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000011" as EntityId;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [],
    } as unknown as QueryEntitiesResponse);

    expect(
      await run(
        { kind: "EntityId", value: [entityId] },
        {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: { kind: "entityType" },
              operator: "isOfType",
              value: {
                kind: "VersionedUrl",
                value:
                  "https://example.com/types/entity-type/company/v/1" as VersionedUrl,
              },
            },
          ],
        },
      ),
    ).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${entityId} wasn't found or you don't have access to it.`,
      contents: [],
    });
  });
});
