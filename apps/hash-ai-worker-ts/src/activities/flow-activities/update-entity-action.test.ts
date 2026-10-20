import { beforeEach, describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { updateEntityAction } from "./update-entity-action.js";

import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  QueryEntitiesResponse,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { EntityValidationReport } from "@local/hash-graph-sdk/validation";
import type { PropertyValues } from "@local/hash-isomorphic-utils/flows/property-values";
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
const { validate } = vi.hoisted(() => ({
  validate: vi.fn<typeof HashEntity.validate>(),
}));
vi.mock("@local/hash-graph-sdk/entity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HashEntity: { validate },
  queryEntities: vi.fn(),
}));

const personType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const emailUrl = "https://example.com/types/property-type/email/" as BaseUrl;
const textType = "https://example.com/types/data-type/text/v/1";

const entityIdOf = (index: number, draft = false) =>
  `${webId}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}${
    draft ? "~00000000-0000-4000-8000-0000000000ff" : ""
  }` as EntityId;

const patch = vi.fn();

/** Answers the graph query with the entity, if one is given, with the given properties, and whether the user can edit it. */
const mockEntity = (
  entity: { entityId: EntityId; properties: Record<string, unknown> } | null,
  { canEdit = true } = {},
) =>
  vi.mocked(queryEntities).mockResolvedValueOnce({
    permissions:
      entity && canEdit ? { [entity.entityId]: { update: ["edition"] } } : {},
    entities: entity
      ? [
          {
            ...entity,
            propertiesWithMetadata: {
              value: Object.fromEntries(
                Object.entries(entity.properties).map(([baseUrl, value]) => [
                  baseUrl,
                  { value, metadata: { dataTypeId: textType } },
                ]),
              ),
            },
            propertiesMetadata: { value: {} },
            metadata: {
              recordId: { entityId: entity.entityId },
              entityTypeIds: [personType],
              provenance: { edition: { sources: [] } },
            },
            patch,
          },
        ]
      : [],
    cursor: null,
  } as unknown as QueryEntitiesResponse);

const run = (params: {
  entityId: PayloadValue<"EntityId", false>;
  properties?: PropertyValues;
  removeProperties?: BaseUrl[];
}) =>
  updateEntityAction({
    inputs: [
      {
        inputName: "entityId",
        payload: { kind: "EntityId", value: params.entityId },
      },
      ...(params.properties === undefined
        ? []
        : [
            {
              inputName: "properties",
              payload: {
                kind: "PropertyValues" as const,
                value: params.properties,
              },
            },
          ]),
      ...(params.removeProperties === undefined
        ? []
        : [
            {
              inputName: "removeProperties",
              payload: {
                kind: "BaseUrl" as const,
                value: params.removeProperties,
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
    validate.mockReset().mockResolvedValue(undefined);
    vi.mocked(queryEntities).mockReset();
    patch.mockReset().mockResolvedValue({});
  });

  it("replaces the whole list of a list property, adds a property the entity lacks, and outputs the same ID", async () => {
    mockEntity({
      entityId: entityIdOf(1),
      properties: { [emailUrl]: ["ada@example.com", "ada@example.org"] },
    });

    expect(
      await run({
        entityId: entityIdOf(1),
        properties: { [emailUrl]: ["lovelace@example.com"], [nameUrl]: "Ada" },
      }),
    ).toEqual(updated(entityIdOf(1)));

    expect(validate.mock.calls).toMatchObject([
      [
        {},
        { actorId: "user" },
        {
          entityTypes: [personType],
          components: { requiredProperties: false },
        },
      ],
    ]);
    expect(patch).toHaveBeenCalledWith(
      {},
      { actorId: "bot" },
      {
        propertyPatches: [
          {
            op: "replace",
            path: [emailUrl],
            property: {
              value: [
                {
                  value: "lovelace@example.com",
                  metadata: { dataTypeId: null },
                },
              ],
            },
          },
          {
            op: "add",
            path: [nameUrl],
            property: { value: "Ada", metadata: { dataTypeId: null } },
          },
        ],
        draft: false,
        provenance: {
          actorType: "machine",
          origin: { type: "flow", id: "flow", stepIds: ["update"] },
        },
      },
    );
  });

  it("updates the draft an entity ID with a draft ID names, which stays a draft", async () => {
    mockEntity({ entityId: entityIdOf(1, true), properties: {} });

    expect(
      await run({
        entityId: entityIdOf(1, true),
        properties: { [nameUrl]: "Ada" },
      }),
    ).toEqual(updated(entityIdOf(1, true)));

    const query = vi.mocked(queryEntities).mock.calls[0]?.[2];
    expect(query?.includeDrafts).toBe(true);
    expect(query?.includePermissions).toBe(true);
    expect(query?.filter).toMatchObject({
      all: expect.arrayContaining([
        {
          equal: [
            { path: ["draftId"] },
            { parameter: "00000000-0000-4000-8000-0000000000ff" },
          ],
        },
      ]) as unknown[],
    });
    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ draft: true }),
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

    mockEntity({ entityId: entityIdOf(2), properties: {} });

    expect(
      await run({
        entityId: {
          __stored: true,
          kind: "EntityId",
          array: false,
          of: stored,
          index: 1,
        },
        properties: { [nameUrl]: "Grace" },
      }),
    ).toEqual(updated(entityIdOf(2)));
  });

  it.each([
    {
      name: "an entity ID that isn't valid",
      entityId: "" as EntityId,
      properties: { [nameUrl]: "Ada" },
      code: StatusCode.InvalidArgument,
      message: " is not a valid EntityId.",
    },
    {
      name: "an entity in another web",
      entityId:
        "00000000-0000-4000-8000-0000000000aa~00000000-0000-4000-8000-000000000001" as EntityId,
      properties: { [nameUrl]: "Ada" },
      code: StatusCode.InvalidArgument,
      message:
        "Entity 00000000-0000-4000-8000-0000000000aa~00000000-0000-4000-8000-000000000001 isn't in the web the flow runs in, so it can't be updated.",
    },
    {
      name: "no property values",
      entityId: entityIdOf(1),
      properties: {},
      code: StatusCode.InvalidArgument,
      message: "Property values must give a value for at least one property.",
    },
    {
      name: "nothing to set or remove",
      entityId: entityIdOf(1),
      removeProperties: [],
      code: StatusCode.InvalidArgument,
      message: "Give property values to set, properties to remove, or both.",
    },
    {
      name: "a property to remove named by a versioned URL",
      entityId: entityIdOf(1),
      removeProperties: [
        "https://example.com/types/property-type/name/v/1" as BaseUrl,
      ],
      code: StatusCode.InvalidArgument,
      message:
        '"https://example.com/types/property-type/name/v/1" is not a property type base URL.',
    },
    {
      name: "a property both set and removed",
      entityId: entityIdOf(1),
      properties: { [nameUrl]: "Ada" },
      removeProperties: [nameUrl],
      code: StatusCode.InvalidArgument,
      message: `Property ${nameUrl} can't be both set and removed.`,
    },
  ])(
    "fails for $name, without reading or updating the entity",
    async ({ entityId, properties, removeProperties, code, message }) => {
      expect(await run({ entityId, properties, removeProperties })).toEqual({
        code,
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
      await run({ entityId: entityIdOf(1), properties: { [nameUrl]: "Ada" } }),
    ).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${entityIdOf(1)} doesn't exist or can't be read by the user running the flow.`,
      contents: [],
    });
  });

  it("fails for an entity the user can read but not edit, without updating it", async () => {
    mockEntity({ entityId: entityIdOf(1), properties: {} }, { canEdit: false });

    expect(
      await run({ entityId: entityIdOf(1), properties: { [nameUrl]: "Ada" } }),
    ).toEqual({
      code: StatusCode.PermissionDenied,
      message: `The user running the flow can't edit entity ${entityIdOf(1)}.`,
      contents: [],
    });
    expect(validate).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("fails naming the property whose value doesn't fit the entity's types, without updating it", async () => {
    mockEntity({ entityId: entityIdOf(1), properties: {} });
    validate.mockResolvedValueOnce({
      properties: {
        [emailUrl]: { type: "value", validations: [] },
      },
    } as unknown as EntityValidationReport);

    expect(
      await run({ entityId: entityIdOf(1), properties: { [emailUrl]: 42 } }),
    ).toEqual({
      code: StatusCode.InvalidArgument,
      message: `Property ${emailUrl} has a value its property type doesn't allow.`,
      contents: [],
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("fails if the graph doesn't save the update", async () => {
    mockEntity({ entityId: entityIdOf(1), properties: {} });
    patch.mockRejectedValueOnce(new Error("Graph unavailable"));

    const { code, message } = await run({
      entityId: entityIdOf(1),
      properties: { [nameUrl]: "Ada" },
    });

    expect(code).toBe(StatusCode.Internal);
    expect(message).toContain(`Could not update entity ${entityIdOf(1)}`);
  });

  it("removes a property from a live entity, checking the entity it leaves against its types", async () => {
    mockEntity({
      entityId: entityIdOf(1),
      properties: { [nameUrl]: "Ada", [emailUrl]: "ada@example.com" },
    });

    expect(
      await run({
        entityId: entityIdOf(1),
        properties: { [nameUrl]: "Ada Lovelace" },
        removeProperties: [emailUrl],
      }),
    ).toEqual(updated(entityIdOf(1)));

    expect(validate.mock.calls).toMatchObject([
      [
        {},
        { actorId: "user" },
        {
          entityTypes: [personType],
          properties: {
            value: {
              [nameUrl]: {
                value: "Ada Lovelace",
                metadata: { dataTypeId: null },
              },
            },
          },
          components: { requiredProperties: true },
        },
      ],
    ]);
    expect(
      Object.keys(validate.mock.calls[0]?.[2].properties.value ?? {}),
    ).toEqual([nameUrl]);
    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        propertyPatches: [
          {
            op: "replace",
            path: [nameUrl],
            property: {
              value: "Ada Lovelace",
              metadata: { dataTypeId: null },
            },
          },
          { op: "remove", path: [emailUrl] },
        ],
      }),
    );
  });

  it("keeps the metadata of the values it leaves when checking the entity", async () => {
    mockEntity({
      entityId: entityIdOf(1),
      properties: { [nameUrl]: "Ada", [emailUrl]: "ada@example.com" },
    });

    await run({ entityId: entityIdOf(1), removeProperties: [emailUrl] });

    expect(validate.mock.calls[0]?.[2].properties).toEqual({
      value: {
        [nameUrl]: { value: "Ada", metadata: { dataTypeId: textType } },
      },
    });
  });

  it("fails naming a required property it would remove from a live entity, without updating it", async () => {
    mockEntity({
      entityId: entityIdOf(1),
      properties: { [nameUrl]: "Ada" },
    });
    validate.mockResolvedValueOnce({
      properties: { [nameUrl]: { type: "missing" } },
    } as unknown as EntityValidationReport);

    expect(
      await run({ entityId: entityIdOf(1), removeProperties: [nameUrl] }),
    ).toEqual({
      code: StatusCode.InvalidArgument,
      message: `Property ${nameUrl} is required.`,
      contents: [],
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("removes a property from a draft without checking required properties", async () => {
    mockEntity({
      entityId: entityIdOf(1, true),
      properties: { [nameUrl]: "Ada" },
    });

    expect(
      await run({ entityId: entityIdOf(1, true), removeProperties: [nameUrl] }),
    ).toEqual(updated(entityIdOf(1, true)));

    expect(validate).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        propertyPatches: [{ op: "remove", path: [nameUrl] }],
        draft: true,
      }),
    );
  });

  it("skips a property to remove that the entity doesn't have, e.g. one an earlier attempt removed", async () => {
    mockEntity({ entityId: entityIdOf(1), properties: { [nameUrl]: "Ada" } });

    expect(
      await run({ entityId: entityIdOf(1), removeProperties: [emailUrl] }),
    ).toEqual(updated(entityIdOf(1)));

    expect(validate).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
});
