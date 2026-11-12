import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  incrementOntologyTypeVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { queryDataTypes } from "@local/hash-graph-sdk/data-type";

import { updateDataType } from "../../../ontology/primitive/data-type";
import migrate from "./038-update-currency-labels.migration";

import type { MigrationFunction, MigrationState } from "../types";
import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

const settings = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("@local/hash-isomorphic-utils/instance", () => ({
  get isSelfHostedInstance() {
    return settings.selfHosted;
  },
}));
vi.mock("@local/hash-graph-sdk/data-type", () => ({
  queryDataTypes: vi.fn(),
}));
vi.mock("../../../ontology/primitive/data-type", () => ({
  updateDataType: vi.fn(),
}));
vi.mock("../../system-webs-and-entities", () => ({
  getOrCreateOwningWebId: vi
    .fn()
    .mockResolvedValue({ systemActorMachineId: "currency-owner" }),
}));
vi.mock("../currencies", () => ({
  activeCurrencies: [{ code: "USD" }, { code: "CAD" }, { code: "AED" }],
}));

const loadExternalDataType = vi.fn();
const context = {
  graphApi: { loadExternalDataType },
  provenance: { actorType: "machine", origin: { type: "migration" } },
} as unknown as Parameters<MigrationFunction>[0]["context"];
const authentication = {
  actorId: "migration-actor",
} as Parameters<MigrationFunction>[0]["authentication"];

const makeCurrency = (code: string, major = 1): DataTypeWithMetadata => {
  const baseUrl =
    `https://hash.ai/@h/types/data-type/${code.toLowerCase()}/` as BaseUrl;
  const version = makeOntologyTypeVersion({ major });
  return {
    schema: {
      $id: versionedUrlFromComponents(baseUrl, version),
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      kind: "dataType",
      title: code,
      description: `An amount in ${code}.`,
      type: "number",
      allOf: [{ $ref: "https://hash.ai/@h/types/data-type/currency/v/1" }],
      label: code === "USD" ? { left: "$" } : { right: code },
    },
    metadata: { recordId: { baseUrl, version }, conversions: {} },
  } as unknown as DataTypeWithMetadata;
};

let currencies: DataTypeWithMetadata[];
let migrationState: MigrationState;

beforeEach(() => {
  vi.clearAllMocks();
  settings.selfHosted = false;
  currencies = ["USD", "CAD", "AED"].map((code) => makeCurrency(code));
  migrationState = {
    dataTypeVersions: {},
    entityTypeVersions: {},
    propertyTypeVersions: {},
  };
  vi.mocked(queryDataTypes).mockImplementation(
    async (_graph, _authentication, request) => {
      const query = JSON.stringify(request.filter);
      expect(query).toContain('"latest"');
      return {
        dataTypes: currencies.filter((currency) =>
          query.includes(currency.metadata.recordId.baseUrl),
        ),
      };
    },
  );
  vi.mocked(updateDataType).mockImplementation(
    async (_context, _authentication, { dataTypeId, schema, conversions }) => {
      const index = currencies.findIndex(
        (currency) => currency.schema.$id === dataTypeId,
      );
      const current = currencies[index];
      if (!current) {
        throw new Error(`Currency ${dataTypeId} does not exist`);
      }
      const { baseUrl, version } = current.metadata.recordId;
      const nextVersion = incrementOntologyTypeVersion(version);
      const updated: DataTypeWithMetadata = {
        schema: {
          ...current.schema,
          ...schema,
          $id: versionedUrlFromComponents(baseUrl, nextVersion),
        },
        metadata: {
          ...current.metadata,
          recordId: { baseUrl, version: nextVersion },
          conversions,
        },
      };
      currencies[index] = updated;
      return updated;
    },
  );
});

describe("currency label migration", () => {
  it("adds missing codes and symbols without versioning unchanged labels", async () => {
    const original = structuredClone(currencies);
    await migrate({ context, authentication, migrationState });
    expect(currencies.map(({ schema }) => schema.label)).toEqual([
      { left: "$", right: "USD" },
      { left: "$", right: "CAD" },
      { right: "AED" },
    ]);
    expect(updateDataType).toHaveBeenCalledTimes(2);
    expect(updateDataType).toHaveBeenCalledWith(
      context,
      { actorId: "currency-owner" },
      expect.anything(),
    );
    for (const [index, currency] of currencies.entries()) {
      const { $id: _id, label: _label, ...schema } = currency.schema;
      expect(original[index]?.schema).toMatchObject(schema);
      expect(
        migrationState.dataTypeVersions[currency.metadata.recordId.baseUrl],
      ).toBe(currency.metadata.recordId.version);
    }
    expect(original[0]?.schema.label).toEqual({ left: "$" });
  });

  it("preserves constraints, inheritance and conversions on the latest version", async () => {
    const current = makeCurrency("USD", 4);
    current.schema = { ...current.schema, type: "number", minimum: -100 };
    current.metadata.conversions = {
      ["https://example.com/types/data-type/test-currency/" as BaseUrl]: {
        to: { expression: ["*", "self", { const: 2, type: "number" }] },
        from: { expression: ["/", "self", { const: 2, type: "number" }] },
      },
    };
    currencies[0] = current;
    await migrate({ context, authentication, migrationState });
    expect(currencies[0].schema).toMatchObject({
      $id: "https://hash.ai/@h/types/data-type/usd/v/5",
      minimum: -100,
      allOf: current.schema.allOf,
      label: { left: "$", right: "USD" },
    });
    expect(currencies[0].metadata.conversions).toEqual(
      current.metadata.conversions,
    );
  });

  it("recovers from stale migration state without creating another version", async () => {
    await migrate({ context, authentication, migrationState });
    const versions = { ...migrationState.dataTypeVersions };
    migrationState.dataTypeVersions = {};
    vi.mocked(updateDataType).mockClear();
    await migrate({ context, authentication, migrationState });
    expect(updateDataType).not.toHaveBeenCalled();
    expect(migrationState.dataTypeVersions).toEqual(versions);
  });

  it("loads new external versions on self-hosted instances", async () => {
    settings.selfHosted = true;
    await migrate({ context, authentication, migrationState });
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).toHaveBeenCalledTimes(2);
    expect(loadExternalDataType).toHaveBeenCalledWith(
      "currency-owner",
      expect.objectContaining({
        schema: expect.objectContaining({
          $id: "https://hash.ai/@h/types/data-type/usd/v/2",
          label: { left: "$", right: "USD" },
        }),
        conversions: {},
        provenance: context.provenance,
      }),
    );
  });

  it("reports a missing currency instead of silently skipping it", async () => {
    currencies = [];
    await expect(
      migrate({ context, authentication, migrationState }),
    ).rejects.toThrow("Currency data type USD has not been seeded");
    expect(updateDataType).not.toHaveBeenCalled();
  });

  it("propagates query failures without creating replacement types", async () => {
    vi.mocked(queryDataTypes).mockRejectedValue(new Error("Graph unavailable"));
    await expect(
      migrate({ context, authentication, migrationState }),
    ).rejects.toThrow("Graph unavailable");
    expect(updateDataType).not.toHaveBeenCalled();
    expect(loadExternalDataType).not.toHaveBeenCalled();
  });
});
