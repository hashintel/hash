import { beforeEach, describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { hasPermissionForEntityTypes } from "@local/hash-graph-sdk/entity-type";
import { linkEndsMessage } from "@local/hash-isomorphic-utils/flows/entity-steps";
import { StatusCode } from "@local/status";

import { createEntityAction } from "./create-entity-action.js";

import type {
  BaseUrl,
  EntityId,
  PropertyObjectWithMetadata,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  HashEntity,
  QueryEntitiesResponse,
} from "@local/hash-graph-sdk/entity";
import type {
  PayloadValue,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const workflowId = "workflow";
const webId = "00000000-0000-4000-8000-000000000001" as WebId;
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
      flowEntityId: "flow",
      runId: "run",
      stepId: "create",
      userAuthentication: { actorId: "user" },
      webId,
      workflowId,
    }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => storageProvider,
  }),
);
vi.mock("./shared/save-entity.js", () => ({
  getSavingActorId: () => Promise.resolve("bot"),
  retrySave: (save: () => unknown) => save(),
}));
const { create } = vi.hoisted(() => ({
  create: vi.fn<typeof HashEntity.create>(),
}));
vi.mock("@local/hash-graph-sdk/entity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HashEntity: { create },
  queryEntities: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/entity-type", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasPermissionForEntityTypes: vi.fn(),
}));

const personType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const employeeType =
  "https://example.com/types/entity-type/employee/v/1" as VersionedUrl;
const worksForType =
  "https://example.com/types/entity-type/works-for/v/1" as VersionedUrl;
const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const emailUrl = "https://example.com/types/property-type/email/" as BaseUrl;
const text = {
  dataTypeId: "https://example.com/types/data-type/text/v/1" as VersionedUrl,
};

const ada = {
  value: { [nameUrl]: { value: "Ada", metadata: text } },
} satisfies PropertyObjectWithMetadata;

const entityIdOf = (index: number) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as EntityId;

const run = (params: {
  entityTypeIds?: string[];
  properties: PropertyObjectWithMetadata;
  draft?: boolean;
  leftEntityId?: PayloadValue<"EntityId", false>;
  rightEntityId?: PayloadValue<"EntityId", false>;
}) =>
  createEntityAction({
    inputs: [
      {
        inputName: "entityTypeIds",
        payload: {
          kind: "VersionedUrl",
          value: (params.entityTypeIds ?? [personType]) as VersionedUrl[],
        },
      },
      {
        inputName: "properties",
        payload: {
          kind: "PropertyObjectWithMetadata",
          value: params.properties,
        },
      },
      ...(params.draft === undefined
        ? []
        : [
            {
              inputName: "draft",
              payload: { kind: "Boolean" as const, value: params.draft },
            },
          ]),
      ...(["leftEntityId", "rightEntityId"] as const).flatMap((inputName) => {
        const value = params[inputName];

        return value === undefined
          ? []
          : [{ inputName, payload: { kind: "EntityId" as const, value } }];
      }),
    ] satisfies StepInput[],
  });

/** Answers the graph's creation with an entity with the given ID. */
const mockCreated = (entityId: EntityId) =>
  create.mockResolvedValueOnce({ entityId } as unknown as HashEntity);

describe("createEntityAction", () => {
  beforeEach(() => {
    create.mockReset();
    vi.mocked(queryEntities)
      .mockReset()
      .mockResolvedValue({
        entities: [],
        cursor: null,
      } as unknown as QueryEntitiesResponse);
    vi.mocked(hasPermissionForEntityTypes)
      .mockReset()
      .mockImplementation((_graphApi, _authentication, { entityTypeIds }) =>
        Promise.resolve(entityTypeIds),
      );
  });

  it("creates an entity of the type with the properties as given, in the flow's web, and outputs its ID", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002` as EntityId;
    mockCreated(entityId);

    const properties = {
      value: {
        [nameUrl]: { value: "Ada", metadata: text },
        [emailUrl]: { value: [{ value: "ada@example.com", metadata: text }] },
      },
    } satisfies PropertyObjectWithMetadata;

    expect(await run({ properties })).toEqual({
      code: StatusCode.Ok,
      contents: [
        {
          outputs: [
            {
              outputName: "entityId",
              payload: { kind: "EntityId", value: entityId },
            },
          ],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      {},
      { actorId: "bot" },
      expect.objectContaining({
        webId,
        entityTypeIds: [personType],
        properties,
        draft: false,
        provenance: {
          actorType: "machine",
          origin: { type: "flow", id: "flow", stepIds: ["create"] },
        },
      }),
    );
    expect(create.mock.calls[0]?.[2].linkData).toBeUndefined();
  });

  it("creates a draft", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002~00000000-0000-4000-8000-000000000003` as EntityId;
    mockCreated(entityId);

    expect(await run({ properties: ada, draft: true })).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [{ payload: { value: entityId } }] }],
    });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ draft: true }),
    );
  });

  it("creates an entity without properties", async () => {
    mockCreated(`${webId}~00000000-0000-4000-8000-000000000002` as EntityId);

    expect(await run({ properties: { value: {} } })).toMatchObject({
      code: StatusCode.Ok,
    });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ properties: { value: {} } }),
    );
  });

  it("creates an entity with every type given", async () => {
    mockCreated(`${webId}~00000000-0000-4000-8000-000000000002` as EntityId);

    await run({ entityTypeIds: [personType, employeeType], properties: ada });

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ entityTypeIds: [personType, employeeType] }),
    );
  });

  it("creates a link between the entities given", async () => {
    mockCreated(entityIdOf(3));

    expect(
      await run({
        entityTypeIds: [worksForType],
        properties: { value: {} },
        leftEntityId: entityIdOf(1),
        rightEntityId: entityIdOf(2),
      }),
    ).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [{ payload: { value: entityIdOf(3) } }] }],
    });

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      { actorId: "bot" },
      expect.objectContaining({
        entityTypeIds: [worksForType],
        linkData: {
          leftEntityId: entityIdOf(1),
          rightEntityId: entityIdOf(2),
        },
      }),
    );
  });

  it("creates a link to the entity an item of a stored list of entity IDs names", async () => {
    const stored = await storePayload({
      storageProvider,
      workflowId,
      runId: "run",
      stepId: "query",
      outputName: "entities",
      kind: "EntityId",
      value: [entityIdOf(2), entityIdOf(4)],
    });

    mockCreated(entityIdOf(3));

    await run({
      entityTypeIds: [worksForType],
      properties: { value: {} },
      leftEntityId: entityIdOf(1),
      rightEntityId: {
        __stored: true,
        kind: "EntityId",
        array: false,
        of: stored,
        index: 1,
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        linkData: {
          leftEntityId: entityIdOf(1),
          rightEntityId: entityIdOf(4),
        },
      }),
    );
  });

  it.each([
    {
      name: "no entity type IDs",
      params: { entityTypeIds: [], properties: ada },
      message: "Give at least one entity type ID.",
    },
    {
      name: "an entity type ID that isn't a versioned URL",
      params: {
        entityTypeIds: [
          personType,
          "https://example.com/types/entity-type/person/",
        ],
        properties: ada,
      },
      message:
        '"https://example.com/types/entity-type/person/" is not an entity type ID.',
    },
    {
      name: "a value without a data type ID",
      params: {
        properties: {
          value: {
            [nameUrl]: { value: "Ada", metadata: { dataTypeId: null } },
          },
        },
      },
      message: `Property ${nameUrl} must give the data type ID of each of its values.`,
    },
    {
      name: "the entity a link links from without the one it links to",
      params: { properties: ada, leftEntityId: entityIdOf(1) },
      message: linkEndsMessage,
    },
    {
      name: "the entity a link links to without the one it links from",
      params: { properties: ada, rightEntityId: entityIdOf(2) },
      message: linkEndsMessage,
    },
    {
      name: "an entity a link links from that isn't an entity ID",
      params: {
        properties: ada,
        leftEntityId: "person" as EntityId,
        rightEntityId: entityIdOf(2),
      },
      message: "person is not a valid EntityId.",
    },
    {
      name: "an entity a link links to that isn't an entity ID",
      params: {
        properties: ada,
        leftEntityId: entityIdOf(1),
        rightEntityId: "company" as EntityId,
      },
      message: "company is not a valid EntityId.",
    },
  ])(
    "fails for $name, without creating anything",
    async ({ params, message }) => {
      expect(await run(params)).toEqual({
        code: StatusCode.InvalidArgument,
        message,
        contents: [],
      });
      expect(queryEntities).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("fails for a type the user running the flow can't instantiate, e.g. an actor type, without creating anything", async () => {
    vi.mocked(hasPermissionForEntityTypes).mockResolvedValueOnce([personType]);

    expect(
      await run({ entityTypeIds: [personType, employeeType], properties: ada }),
    ).toEqual({
      code: StatusCode.PermissionDenied,
      message: `Entity type ${employeeType} doesn't exist or can't be instantiated by the user running the flow.`,
      contents: [],
    });

    expect(hasPermissionForEntityTypes).toHaveBeenCalledWith(
      {},
      { actorId: "user" },
      { entityTypeIds: [personType, employeeType], action: "instantiate" },
    );
    expect(queryEntities).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("names every type the user running the flow can't instantiate", async () => {
    vi.mocked(hasPermissionForEntityTypes).mockResolvedValueOnce([]);

    expect(
      await run({ entityTypeIds: [personType, employeeType], properties: ada }),
    ).toEqual({
      code: StatusCode.PermissionDenied,
      message: `Entity types ${personType}, ${employeeType} don't exist or can't be instantiated by the user running the flow.`,
      contents: [],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails if the graph doesn't save the entity, e.g. because its properties don't fit the type", async () => {
    create.mockRejectedValueOnce(new Error("Entity validation failed"));

    const { code, message } = await run({ properties: ada });

    expect(code).toBe(StatusCode.Internal);
    expect(message).toContain("Could not create entity");
    expect(message).toContain("Entity validation failed");
  });

  it("gives the entity the same UUID on every attempt of the step in a run", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002` as EntityId;
    mockCreated(entityId);
    mockCreated(entityId);

    await run({ properties: ada });
    await run({ properties: ada });

    const [first, second] = create.mock.calls.map(
      ([, , params]) => params.entityUuid,
    );

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).toBe(first);
  });

  it("outputs the entity an earlier attempt of the step created, without creating a second one", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002` as EntityId;
    vi.mocked(queryEntities).mockResolvedValueOnce({
      entities: [{ entityId }],
      cursor: null,
    } as unknown as QueryEntitiesResponse);

    expect(await run({ properties: ada })).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [{ payload: { value: entityId } }] }],
    });

    const query = vi.mocked(queryEntities).mock.calls[0];
    expect(query?.[1]).toEqual({ actorId: "bot" });
    expect(query?.[2].includeDrafts).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
