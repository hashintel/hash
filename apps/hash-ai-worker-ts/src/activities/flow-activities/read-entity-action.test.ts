import { beforeEach, describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { readEntityAction } from "./read-entity-action.js";

import type { BaseUrl, EntityId, WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import type { EntityProperty } from "@local/hash-isomorphic-utils/flows/read-entity";
import type {
  PayloadValue,
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
      stepId: "read",
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

const webId = "00000000-0000-4000-8000-000000000001" as WebId;
const entityIdOf = (index: number) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as EntityId;

const fieldUrl = "https://example.com/types/property-type/field/" as BaseUrl;

/** Answers the graph query with the given entities, each with the given value of the property read. */
const mockEntities = (entities: { entityId: EntityId; value?: unknown }[]) =>
  vi.mocked(queryEntities).mockResolvedValueOnce({
    entities: entities.map(({ entityId, value }) => ({
      properties: value === undefined ? {} : { [fieldUrl]: value },
      metadata: { recordId: { entityId }, entityTypeIds: [] },
    })),
    cursor: null,
  } as unknown as QueryEntitiesResponse);

const run = (params: {
  entityId: PayloadValue<"EntityId", false>;
  payloadKind: string;
}) =>
  readEntityAction({
    inputs: [
      {
        inputName: "entityId",
        payload: { kind: "EntityId", value: params.entityId },
      },
      {
        inputName: "property",
        payload: {
          kind: "EntityProperty",
          value: {
            kind: "entityProperty",
            propertyTypeBaseUrl: fieldUrl,
            payloadKind: params.payloadKind,
          } as EntityProperty,
        },
      },
    ] satisfies StepInput[],
  });

/** Reads the property of the entity `value` is the value of. */
const read = (payloadKind: string, value: unknown) => {
  mockEntities([{ entityId: entityIdOf(1), value }]);
  return run({ entityId: entityIdOf(1), payloadKind });
};

describe("readEntityAction", () => {
  beforeEach(() => {
    vi.mocked(queryEntities).mockReset();
  });

  /* A falsy value of each kind, where it has one, so that it isn't mistaken for a missing one. */
  it.each([
    { kind: "Text", value: "ada@example.com" },
    { kind: "Number", value: 0 },
    { kind: "Boolean", value: false },
    { kind: "Date", value: "2026-02-28" },
  ])("outputs a $kind value as that kind", async ({ kind, value }) => {
    expect(await read(kind, value)).toEqual({
      code: StatusCode.Ok,
      contents: [
        { outputs: [{ outputName: "value", payload: { kind, value } }] },
      ],
    });
  });

  it.each([
    { name: "doesn't have the property", value: undefined },
    { name: "has null for it", value: null },
    { name: "has an empty value for it", value: "" },
  ])(
    "gives no output, so later steps are skipped, when the entity $name",
    async ({ value }) => {
      expect(await read("Text", value)).toMatchObject({
        code: StatusCode.Ok,
        contents: [{ outputs: [] }],
      });
    },
  );

  it("fails for an entity that is missing or the user can't read", async () => {
    mockEntities([]);

    expect(await run({ entityId: entityIdOf(1), payloadKind: "Text" })).toEqual(
      {
        code: StatusCode.NotFound,
        message: `Entity ${entityIdOf(1)} wasn't found or you don't have access to it.`,
        contents: [],
      },
    );
  });

  it.each([[["ada@example.com", "ada@example.org"]], [["ada@example.com"]]])(
    "fails for a property with a list of values: %j",
    async (values) => {
      const { code, message } = await read("Text", values);
      expect(code).toBe(StatusCode.InvalidArgument);
      expect(message).toContain("has a list of values");
    },
  );

  it.each([
    { kind: "Text", value: 42 },
    { kind: "Number", value: "42" },
    { kind: "Boolean", value: "true" },
    { kind: "Date", value: "2026-02-30" },
    { kind: "Date", value: "2026-02-28T12:00:00Z" },
    { kind: "Text", value: { nested: "object" } },
  ])(
    "fails for a value that isn't the declared kind: $kind, $value",
    async ({ kind, value }) => {
      const { code, message, contents } = await read(kind, value);
      expect(code).toBe(StatusCode.InvalidArgument);
      expect(message).toContain(`is read as ${kind}`);
      expect(contents).toEqual([]);
    },
  );

  it("fails for a kind it can't read, without reading the entity", async () => {
    expect(
      await run({ entityId: entityIdOf(1), payloadKind: "Duration" }),
    ).toMatchObject({
      code: StatusCode.InvalidArgument,
      message: "A property can only be read as Text, Number, Boolean, Date.",
    });
    expect(queryEntities).not.toHaveBeenCalled();
  });

  it("fails for an entity ID that is empty, rather than treating it as having no properties", async () => {
    expect(
      await run({ entityId: "" as EntityId, payloadKind: "Text" }),
    ).toMatchObject({ code: StatusCode.InvalidArgument });
  });

  it("reads the entity an item of a stored list of entity IDs names", async () => {
    const stored = await storePayload({
      storageProvider,
      workflowId,
      runId: "run",
      stepId: "query",
      outputName: "entities",
      kind: "EntityId",
      value: [entityIdOf(1), entityIdOf(2)],
    });

    mockEntities([{ entityId: entityIdOf(2), value: "grace@example.com" }]);

    expect(
      await run({
        entityId: {
          __stored: true,
          kind: "EntityId",
          array: false,
          of: stored,
          index: 1,
        },
        payloadKind: "Text",
      }),
    ).toEqual({
      code: StatusCode.Ok,
      contents: [
        {
          outputs: [
            {
              outputName: "value",
              payload: { kind: "Text", value: "grace@example.com" },
            },
          ],
        },
      ],
    });
  });
});
