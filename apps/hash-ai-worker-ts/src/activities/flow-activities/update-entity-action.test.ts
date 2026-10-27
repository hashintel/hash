import { beforeEach, describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { noEntityChangesMessage } from "@local/hash-isomorphic-utils/flows/entity-steps";
import { StatusCode } from "@local/status";

import { updateEntityAction } from "./update-entity-action.js";

import type {
  BaseUrl,
  EntityId,
  PropertyPatchOperation,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { QueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
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
      stepId: "update",
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
vi.mock("@local/hash-graph-sdk/entity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  queryEntities: vi.fn(),
}));
const personType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const employeeType =
  "https://example.com/types/entity-type/employee/v/1" as VersionedUrl;
const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const emailUrl = "https://example.com/types/property-type/email/" as BaseUrl;
const text = {
  dataTypeId: "https://example.com/types/data-type/text/v/1" as VersionedUrl,
};

const setName = {
  op: "add",
  path: [nameUrl],
  property: { value: "Ada", metadata: text },
} satisfies PropertyPatchOperation;

const entityIdOf = (index: number, draft = false) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}${
    draft ? "~00000000-0000-4000-8000-0000000000ff" : ""
  }` as EntityId;

const patch = vi.fn();

/** Answers the graph query with an entity with the given ID, if one is given, and whether the user can edit it. */
const mockEntity = (entityId: EntityId | null, { canEdit = true } = {}) =>
  vi.mocked(queryEntities).mockResolvedValueOnce({
    permissions:
      entityId && canEdit ? { [entityId]: { update: ["edition"] } } : {},
    entities: entityId ? [{ entityId, patch }] : [],
    cursor: null,
  } as unknown as QueryEntitiesResponse);

const run = (params: {
  entityId: PayloadValue<"EntityId", false>;
  propertyPatches: PayloadValue<"PropertyPatch", true>;
  entityTypeIds?: string[];
}) =>
  updateEntityAction({
    inputs: [
      {
        inputName: "entityId",
        payload: { kind: "EntityId", value: params.entityId },
      },
      {
        inputName: "propertyPatches",
        payload: { kind: "PropertyPatch", value: params.propertyPatches },
      },
      ...(params.entityTypeIds === undefined
        ? []
        : [
            {
              inputName: "entityTypeIds",
              payload: {
                kind: "VersionedUrl" as const,
                value: params.entityTypeIds as VersionedUrl[],
              },
            },
          ]),
    ] satisfies StepInput[],
  });

const updated = (entityId: EntityId) => ({
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

describe("updateEntityAction", () => {
  beforeEach(() => {
    vi.mocked(queryEntities).mockReset();
    patch.mockReset().mockResolvedValue({});
  });

  it("applies the patches as given, as the web's machine, and outputs the same ID", async () => {
    mockEntity(entityIdOf(1));

    const propertyPatches = [
      setName,
      {
        op: "replace",
        path: [emailUrl],
        property: { value: [{ value: "ada@example.com", metadata: text }] },
      },
      {
        op: "remove",
        path: ["https://example.com/types/property-type/age/" as BaseUrl],
      },
    ] satisfies PropertyPatchOperation[];

    expect(await run({ entityId: entityIdOf(1), propertyPatches })).toEqual(
      updated(entityIdOf(1)),
    );

    expect(vi.mocked(queryEntities).mock.calls[0]?.[1]).toEqual({
      actorId: "user",
    });
    expect(patch).toHaveBeenCalledWith(
      {},
      { actorId: "bot" },
      {
        propertyPatches,
        draft: false,
        provenance: {
          actorType: "machine",
          origin: { type: "flow", id: "flow", stepIds: ["update"] },
        },
      },
    );
  });

  it("updates the draft an entity ID with a draft ID names, which stays a draft", async () => {
    mockEntity(entityIdOf(1, true));

    expect(
      await run({ entityId: entityIdOf(1, true), propertyPatches: [setName] }),
    ).toEqual(updated(entityIdOf(1, true)));

    const query = vi.mocked(queryEntities).mock.calls[0]?.[2];
    expect(query?.includeDrafts).toBe(true);
    expect(query?.includePermissions).toBe(true);
    expect(query?.filter).toMatchObject({
      all: expect.arrayContaining([
        {
          all: expect.arrayContaining([
            {
              equal: [
                { path: ["draftId"] },
                { parameter: "00000000-0000-4000-8000-0000000000ff" },
              ],
            },
          ]) as unknown[],
        },
      ]) as unknown[],
    });
    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ draft: true }),
    );
  });

  it("changes the entity's types alone", async () => {
    mockEntity(entityIdOf(1));

    expect(
      await run({
        entityId: entityIdOf(1),
        propertyPatches: [],
        entityTypeIds: [personType, employeeType],
      }),
    ).toEqual(updated(entityIdOf(1)));

    expect(patch).toHaveBeenCalledWith(
      {},
      { actorId: "bot" },
      {
        propertyPatches: [],
        entityTypeIds: [personType, employeeType],
        draft: false,
        provenance: {
          actorType: "machine",
          origin: { type: "flow", id: "flow", stepIds: ["update"] },
        },
      },
    );
  });

  it("changes the entity's types and properties together", async () => {
    mockEntity(entityIdOf(1));

    await run({
      entityId: entityIdOf(1),
      propertyPatches: [setName],
      entityTypeIds: [employeeType],
    });

    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        propertyPatches: [setName],
        entityTypeIds: [employeeType],
      }),
    );
  });

  it("updates the entity an item of a stored list of entity IDs names", async () => {
    const stored = await storePayload({
      storageProvider,
      workflowId,
      runId: "run",
      stepId: "query",
      outputName: "entities",
      kind: "EntityId",
      value: [entityIdOf(1), entityIdOf(2)],
    });

    mockEntity(entityIdOf(2));

    expect(
      await run({
        entityId: {
          __stored: true,
          kind: "EntityId",
          array: false,
          of: stored,
          index: 1,
        },
        propertyPatches: [setName],
      }),
    ).toEqual(updated(entityIdOf(2)));
  });

  it.each([
    {
      name: "an entity ID that isn't valid",
      entityId: "" as EntityId,
      propertyPatches: [setName],
      message: " is not a valid EntityId.",
    },
    {
      name: "an entity in another web",
      entityId:
        "00000000-0000-4000-8000-0000000000aa~00000000-0000-4000-8000-000000000001" as EntityId,
      propertyPatches: [setName],
      message:
        "Entity 00000000-0000-4000-8000-0000000000aa~00000000-0000-4000-8000-000000000001 isn't in the web the flow runs in, so it can't be updated.",
    },
    {
      name: "an empty list of patches without types",
      entityId: entityIdOf(1),
      propertyPatches: [],
      message: noEntityChangesMessage,
    },
    {
      name: "an empty list of types",
      entityId: entityIdOf(1),
      propertyPatches: [],
      entityTypeIds: [],
      message: "Give at least one entity type ID.",
    },
    {
      name: "a type that isn't a versioned URL",
      entityId: entityIdOf(1),
      propertyPatches: [],
      entityTypeIds: ["https://example.com/types/entity-type/person/"],
      message:
        '"https://example.com/types/entity-type/person/" is not an entity type ID.',
    },
    {
      name: "a patch inside a property's value",
      entityId: entityIdOf(1),
      propertyPatches: [{ op: "remove", path: [emailUrl, 0] }],
      message: `Property patch 1 changes part of property ${emailUrl}, which isn't supported yet: give its whole value.`,
    },
    {
      name: "two patches to the same property, which fail if applied again",
      entityId: entityIdOf(1),
      propertyPatches: [
        { ...setName, op: "replace" },
        { op: "remove", path: [nameUrl] },
      ],
      message: `Property patch 2 changes property ${nameUrl} again: give one patch per property.`,
    },
    {
      name: "a value without a data type ID",
      entityId: entityIdOf(1),
      propertyPatches: [
        {
          op: "add",
          path: [nameUrl],
          property: { value: "Ada", metadata: { dataTypeId: null } },
        },
      ],
      message: `Property ${nameUrl} must give the data type ID of each of its values.`,
    },
  ] satisfies {
    name: string;
    entityId: EntityId;
    propertyPatches: PropertyPatchOperation[];
    entityTypeIds?: string[];
    message: string;
  }[])(
    "fails for $name, without reading or updating the entity",
    async ({ message, ...params }) => {
      expect(await run(params)).toEqual({
        code: StatusCode.InvalidArgument,
        message,
        contents: [],
      });
      expect(queryEntities).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
    },
  );

  it("fails for an entity that is missing or the user can't read", async () => {
    mockEntity(null);

    expect(
      await run({ entityId: entityIdOf(1), propertyPatches: [setName] }),
    ).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${entityIdOf(1)} doesn't exist or can't be read by the user running the flow.`,
      contents: [],
    });
  });

  it("fails for an entity the user can read but not edit, without updating it", async () => {
    mockEntity(entityIdOf(1), { canEdit: false });

    expect(
      await run({ entityId: entityIdOf(1), propertyPatches: [setName] }),
    ).toEqual({
      code: StatusCode.PermissionDenied,
      message: `The user running the flow can't edit entity ${entityIdOf(1)}.`,
      contents: [],
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("fails if the graph doesn't save the update, e.g. because the entity it leaves doesn't fit its types", async () => {
    mockEntity(entityIdOf(1));
    patch.mockRejectedValueOnce(new Error("Entity validation failed"));

    const { code, message } = await run({
      entityId: entityIdOf(1),
      propertyPatches: [setName],
    });

    expect(code).toBe(StatusCode.Internal);
    expect(message).toContain(`Could not update entity ${entityIdOf(1)}`);
    expect(message).toContain("Entity validation failed");
  });
});
