import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";

import { updateDataType } from "../../../../ontology/primitive/data-type";
import { createSystemDataTypeIfNotExists } from "../../util";
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

describe("unit hierarchy upgrades", () => {
  it("keeps a newly created or already matching type at its current version", async () => {
    vi.mocked(createSystemDataTypeIfNotExists).mockResolvedValue(updated);
    expect(
      await ensureUnitDataType(context, authentication, parameters()),
    ).toBe(updated);
    expect(getDataTypeById).not.toHaveBeenCalled();
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).not.toHaveBeenCalled();
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
