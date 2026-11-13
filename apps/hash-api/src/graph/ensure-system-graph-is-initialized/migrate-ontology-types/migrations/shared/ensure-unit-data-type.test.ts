import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";

import { updateDataType } from "../../../../ontology/primitive/data-type";
import { createSystemDataTypeIfNotExists } from "../../util";
import { scaledConversion } from "./conversions";
import { ensureUnitDataType } from "./ensure-unit-data-type";

import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

const settings = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("@local/hash-isomorphic-utils/instance", () => ({
  get isSelfHostedInstance() {
    return settings.selfHosted;
  },
}));
vi.mock("@local/hash-graph-sdk/data-type", () => ({
  getDataTypeById: vi.fn(),
}));
vi.mock("../../../../ontology/primitive/data-type", () => ({
  updateDataType: vi.fn(),
}));
vi.mock("../../../system-webs-and-entities", () => ({
  getOrCreateOwningWebId: vi
    .fn()
    .mockResolvedValue({ systemActorMachineId: "system-actor" }),
}));
vi.mock("../../util", () => ({
  createSystemDataTypeIfNotExists: vi.fn(),
  generateSystemDataTypeSchema: ({
    dataTypeId,
    ...schema
  }: Record<string, unknown>) => ({
    ...schema,
    $id: dataTypeId,
    kind: "dataType",
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
  }),
}));

type Arguments = Parameters<typeof ensureUnitDataType>;
const baseUrl = "https://hash.ai/@h/types/data-type/feet/" as BaseUrl;
const oldParent = "https://hash.ai/@h/types/data-type/imperial-length-uk/v/1";
const newParent = "https://hash.ai/@h/types/data-type/length-imperial/v/1";
const existing = {
  schema: {
    $id: `${baseUrl}v/1`,
    allOf: [{ $ref: oldParent }],
    title: "Feet",
    type: "number",
    description: "A unit of length.",
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
  },
  metadata: {
    recordId: { baseUrl, version: makeOntologyTypeVersion({ major: 1 }) },
  },
} as unknown as DataTypeWithMetadata;
const updated = {
  schema: {
    ...existing.schema,
    $id: `${baseUrl}v/2`,
    allOf: [{ $ref: newParent }],
  },
  metadata: {
    recordId: { baseUrl, version: makeOntologyTypeVersion({ major: 2 }) },
  },
} as unknown as DataTypeWithMetadata;
const loadExternalDataType = vi.fn();
const context = {
  graphApi: { loadExternalDataType },
  provenance: { actorType: "machine", origin: { type: "migration" } },
} as unknown as Arguments[0];
const authentication = { actorId: "migration-actor" } as Arguments[1];
const parameters = (): Arguments[2] => ({
  dataTypeDefinition: {
    allOf: [{ $ref: newParent }],
    title: "Feet",
    description: "A unit of length.",
    type: "number",
  },
  conversions: {},
  migrationState: {
    dataTypeVersions: {},
    propertyTypeVersions: {},
    entityTypeVersions: {},
  },
  webShortname: "h",
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.selfHosted = false;
  vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue(existing);
  vi.mocked(getDataTypeById).mockRejectedValue(new NotFoundError("Not found"));
  vi.mocked(updateDataType).mockResolvedValue(updated);
  loadExternalDataType.mockResolvedValue({ data: updated.metadata });
});

describe("unit definition upgrades", () => {
  it("keeps a newly created or already matching type at its current version", async () => {
    vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue(updated);
    expect(
      await ensureUnitDataType(context, authentication, parameters()),
    ).toBe(updated);
    expect(getDataTypeById).not.toHaveBeenCalled();
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).not.toHaveBeenCalled();
  });

  it("treats an omitted abstract flag as false", async () => {
    vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue({
      ...updated,
      schema: { ...updated.schema, abstract: false },
    });
    const params = parameters();
    await ensureUnitDataType(context, authentication, params);
    expect(updateDataType).not.toHaveBeenCalled();
    expect(params.migrationState.dataTypeVersions[baseUrl]).toBe(
      makeOntologyTypeVersion({ major: 2 }),
    );
  });

  it.each([
    { minimum: 0 },
    { maximum: 100 },
    { exclusiveMinimum: 0 },
    { exclusiveMaximum: 100 },
    { multipleOf: 0.5 },
  ])(
    "upgrades changed constraints even when parents match: %j",
    async (constraint) => {
      vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue(updated);
      const params = parameters();
      params.dataTypeDefinition = {
        ...params.dataTypeDefinition,
        ...constraint,
      };
      await ensureUnitDataType(context, authentication, params);
      expect(updateDataType).toHaveBeenCalledWith(
        context,
        { actorId: "system-actor" },
        expect.objectContaining({
          dataTypeId: updated.schema.$id,
          schema: expect.objectContaining(constraint),
        }),
      );
    },
  );

  it("upgrades changed conversions even when the schema matches", async () => {
    const target = "https://hash.ai/@h/types/data-type/meters/" as BaseUrl;
    vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue({
      ...updated,
      metadata: {
        ...updated.metadata,
        conversions: { [target]: scaledConversion(0.3) },
      },
    });
    const params = parameters();
    params.conversions = { [target]: scaledConversion(0.3048) };
    await ensureUnitDataType(context, authentication, params);
    expect(updateDataType).toHaveBeenCalledWith(
      context,
      { actorId: "system-actor" },
      expect.objectContaining({
        dataTypeId: updated.schema.$id,
        conversions: params.conversions,
      }),
    );
  });

  it.each([
    [Math.PI, 3.14159265358979],
    [745.6998715822702, 745.69987158227],
    [1.3558179483314003, 1.3558179483314],
  ])(
    "reuses graph-rounded conversion constants: %s",
    async (requested, saved) => {
      const target = "https://hash.ai/@h/types/data-type/meters/" as BaseUrl;
      vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue({
        ...updated,
        metadata: {
          ...updated.metadata,
          conversions: { [target]: scaledConversion(saved) },
        },
      });
      const params = parameters();
      params.conversions = { [target]: scaledConversion(requested) };
      await ensureUnitDataType(context, authentication, params);
      expect(getDataTypeById).not.toHaveBeenCalled();
      expect(updateDataType).not.toHaveBeenCalled();
    },
  );

  it.each([
    [1e-30, 2e-30],
    [1e30, 2e30],
    [1_000_000_000_000_001, 1_000_000_000_000_002],
  ])(
    "preserves changes to small, large, and integer constants: %s",
    async (requested, saved) => {
      const target = "https://hash.ai/@h/types/data-type/meters/" as BaseUrl;
      vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue({
        ...updated,
        metadata: {
          ...updated.metadata,
          conversions: { [target]: scaledConversion(saved) },
        },
      });
      const params = parameters();
      params.conversions = { [target]: scaledConversion(requested) };
      await ensureUnitDataType(context, authentication, params);
      expect(updateDataType).toHaveBeenCalledWith(
        context,
        { actorId: "system-actor" },
        expect.objectContaining({ conversions: params.conversions }),
      );
    },
  );

  it("skips stale intermediate versions and reuses the matching definition", async () => {
    const params = parameters();
    params.dataTypeDefinition = {
      ...params.dataTypeDefinition,
      type: "number",
      minimum: 0,
    };
    const current = {
      ...updated,
      schema: { ...updated.schema, $id: `${baseUrl}v/3`, minimum: 0 },
      metadata: {
        ...updated.metadata,
        recordId: { baseUrl, version: makeOntologyTypeVersion({ major: 3 }) },
      },
    } as DataTypeWithMetadata;
    vi.mocked(getDataTypeById)
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(current);
    expect(await ensureUnitDataType(context, authentication, params)).toBe(
      current,
    );
    expect(updateDataType).not.toHaveBeenCalled();
    expect(params.migrationState.dataTypeVersions[baseUrl]).toBe(
      makeOntologyTypeVersion({ major: 3 }),
    );
  });

  it("creates a new hosted version using the owning system actor", async () => {
    const params = parameters();
    expect(await ensureUnitDataType(context, authentication, params)).toBe(
      updated,
    );
    expect(updateDataType).toHaveBeenCalledWith(
      context,
      { actorId: "system-actor" },
      {
        dataTypeId: existing.schema.$id,
        schema: params.dataTypeDefinition,
        conversions: params.conversions,
      },
    );
    expect(params.migrationState.dataTypeVersions[baseUrl]).toBe(
      makeOntologyTypeVersion({ major: 2 }),
    );
    expect(existing.schema.allOf).toEqual([{ $ref: oldParent }]);
  });

  it("loads the new external version on a self-hosted instance", async () => {
    settings.selfHosted = true;
    const params = parameters();
    const result = await ensureUnitDataType(context, authentication, params);
    expect(result.schema.$id).toBe(updated.schema.$id);
    expect(loadExternalDataType).toHaveBeenCalledWith(
      "system-actor",
      expect.objectContaining({
        schema: expect.objectContaining({
          $id: updated.schema.$id,
          allOf: [{ $ref: newParent }],
        }),
        conversions: params.conversions,
      }),
    );
    expect(updateDataType).not.toHaveBeenCalled();
    expect(params.migrationState.dataTypeVersions[baseUrl]).toBe(
      makeOntologyTypeVersion({ major: 2 }),
    );
  });

  it("resumes after a version was created but migration state was not saved", async () => {
    vi.mocked(getDataTypeById).mockResolvedValue(updated);
    const params = parameters();
    expect(await ensureUnitDataType(context, authentication, params)).toBe(
      updated,
    );
    expect(params.migrationState.dataTypeVersions[baseUrl]).toBe(
      makeOntologyTypeVersion({ major: 2 }),
    );
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).not.toHaveBeenCalled();
  });

  it("does not treat read failures as a missing version", async () => {
    vi.mocked(getDataTypeById).mockRejectedValue(
      new Error("Permission denied"),
    );
    await expect(
      ensureUnitDataType(context, authentication, parameters()),
    ).rejects.toThrow("Permission denied");
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).not.toHaveBeenCalled();
  });
});
