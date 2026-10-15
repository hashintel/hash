import { beforeEach, describe, expect, it, vi } from "vitest";

import { StatusCode } from "@local/status";

import { createEntityAction } from "./create-entity-action.js";

import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { EntityValidationReport } from "@local/hash-graph-sdk/validation";
import type { PropertyValues } from "@local/hash-isomorphic-utils/flows/property-values";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";

const webId = "00000000-0000-4000-8000-000000000001" as WebId;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      flowEntityId: "flow",
      stepId: "create",
      userAuthentication: { actorId: "user" },
      webId,
    }),
}));
vi.mock("./shared/save-entity.js", () => ({
  getSavingActorId: () => Promise.resolve("bot"),
  retrySave: (save: () => unknown) => save(),
}));
const { validate, create } = vi.hoisted(() => ({
  validate: vi.fn<typeof HashEntity.validate>(),
  create: vi.fn<typeof HashEntity.create>(),
}));
vi.mock("@local/hash-graph-sdk/entity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HashEntity: { validate, create },
}));

const personType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const emailUrl = "https://example.com/types/property-type/email/" as BaseUrl;

const run = (params: {
  entityTypeId?: string;
  properties: PropertyValues;
  draft?: boolean;
}) =>
  createEntityAction({
    inputs: [
      {
        inputName: "entityTypeId",
        payload: {
          kind: "VersionedUrl",
          value: (params.entityTypeId ?? personType) as VersionedUrl,
        },
      },
      {
        inputName: "properties",
        payload: { kind: "PropertyValues", value: params.properties },
      },
      ...(params.draft === undefined
        ? []
        : [
            {
              inputName: "draft",
              payload: { kind: "Boolean" as const, value: params.draft },
            },
          ]),
    ] satisfies StepInput[],
  });

/** Answers the graph's creation with an entity with the given ID. */
const mockCreated = (entityId: EntityId) =>
  create.mockResolvedValueOnce({ entityId } as unknown as HashEntity);

describe("createEntityAction", () => {
  beforeEach(() => {
    validate.mockReset().mockResolvedValue(undefined);
    create.mockReset();
  });

  it("creates an entity of the type with the values, in the flow's web, and outputs its ID", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002` as EntityId;
    mockCreated(entityId);

    expect(
      await run({
        properties: { [nameUrl]: "Ada", [emailUrl]: ["ada@example.com"] },
      }),
    ).toEqual({
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

    /* Without a data type ID, the graph infers each value's data type from its property type. */
    const properties = {
      value: {
        [nameUrl]: { value: "Ada", metadata: { dataTypeId: null } },
        [emailUrl]: {
          value: [{ value: "ada@example.com", metadata: { dataTypeId: null } }],
          metadata: undefined,
        },
      },
      metadata: undefined,
    };

    expect(validate.mock.calls).toMatchObject([
      [
        {},
        { actorId: "user" },
        {
          entityTypes: [personType],
          properties,
          components: { requiredProperties: true },
        },
      ],
    ]);
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
  });

  it("creates a draft, which may leave required properties out", async () => {
    const entityId =
      `${webId}~00000000-0000-4000-8000-000000000002~00000000-0000-4000-8000-000000000003` as EntityId;
    mockCreated(entityId);

    expect(
      await run({ properties: { [nameUrl]: "Ada" }, draft: true }),
    ).toMatchObject({
      code: StatusCode.Ok,
      contents: [{ outputs: [{ payload: { value: entityId } }] }],
    });
    expect(validate.mock.calls[0]?.[2].components).toMatchObject({
      requiredProperties: false,
    });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ draft: true }),
    );
  });

  it.each([
    {
      name: "an entity type ID that isn't a versioned URL",
      params: {
        entityTypeId: "https://example.com/types/entity-type/person/",
        properties: { [nameUrl]: "Ada" },
      },
      message:
        '"https://example.com/types/entity-type/person/" is not an entity type ID.',
    },
    {
      name: "no property values",
      params: { properties: {} },
      message: "Property values must give a value for at least one property.",
    },
  ])(
    "fails for $name, without checking or creating anything",
    async ({ params, message }) => {
      expect(await run(params)).toEqual({
        code: StatusCode.InvalidArgument,
        message,
        contents: [],
      });
      expect(validate).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("fails naming each property whose value doesn't fit the type, without creating the entity", async () => {
    validate.mockResolvedValueOnce({
      properties: {
        [nameUrl]: {
          type: "wrongType",
          data: { actual: "array", expected: "value" },
        },
        [emailUrl]: { type: "unexpected" },
      },
    } as EntityValidationReport);

    expect(
      await run({
        properties: { [nameUrl]: ["Ada"], [emailUrl]: "ada@example.com" },
      }),
    ).toEqual({
      code: StatusCode.InvalidArgument,
      message: `Property ${nameUrl} takes a single value, but was given a list. Property ${emailUrl} isn't a property of the entity type.`,
      contents: [],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails for a type the graph can't check the values against", async () => {
    validate.mockRejectedValueOnce(new Error("Entity type not found"));

    const { code, message } = await run({ properties: { [nameUrl]: "Ada" } });

    expect(code).toBe(StatusCode.InvalidArgument);
    expect(message).toContain(
      `Could not check the property values against ${personType}`,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("fails if the graph doesn't save the entity", async () => {
    create.mockRejectedValueOnce(new Error("Graph unavailable"));

    const { code, message } = await run({ properties: { [nameUrl]: "Ada" } });

    expect(code).toBe(StatusCode.Internal);
    expect(message).toContain("Could not create entity");
  });
});
