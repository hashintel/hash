import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  componentsFromVersionedUrl,
  extractBaseUrl,
  incrementOntologyTypeVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { getPropertyTypeById } from "@local/hash-graph-sdk/property-type";
import {
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { archiveDataType } from "../../../ontology/primitive/data-type";
import * as util from "../util";
import supplyChainMigration from "./026-add-supply-chain-types.migration";
import siUnitMigration from "./034-add-si-unit-data-types.migration";
import { ensureUnitDataType } from "./034-add-si-unit-data-types/ensure-unit-data-type";
import migrate, {
  archivedLengthGroupKeys,
  upgradedEntityTypeKeys,
  upgradedPropertyTypeKeys,
  upgradedUnitKeys,
} from "./039-move-supply-chain-types-to-current-units.migration";

import type { MigrationFunction, MigrationState } from "../types";
import type {
  DataTypeWithMetadata,
  EntityType,
  EntityTypeWithMetadata,
  PropertyType,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const instance = vi.hoisted(() => ({ isSelfHostedInstance: false }));

vi.mock("@local/hash-isomorphic-utils/instance", () => ({
  get isSelfHostedInstance() {
    return instance.isSelfHostedInstance;
  },
}));

vi.mock("@local/hash-graph-sdk/data-type", () => ({
  getDataTypeById: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/entity-type", () => ({
  getEntityTypeById: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/property-type", () => ({
  getPropertyTypeById: vi.fn(),
}));
vi.mock("../../../ontology/primitive/data-type", () => ({
  archiveDataType: vi.fn(),
}));

vi.mock("./034-add-si-unit-data-types/ensure-unit-data-type", () => ({
  ensureUnitDataType: vi.fn(),
}));

vi.mock("../util", async (importOriginal) => {
  const actual = await importOriginal<typeof util>();
  return {
    ...actual,
    createSystemDataTypeIfNotExists: vi.fn(),
    createSystemPropertyTypeIfNotExists: vi.fn(),
    createSystemEntityTypeIfNotExists: vi.fn(),
    updateSystemPropertyType: vi.fn(),
    updateSystemEntityType: vi.fn(),
  };
});

const v1 = makeOntologyTypeVersion({ major: 1 });

const nextVersionOf = (typeId: VersionedUrl) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeId);
  return versionedUrlFromComponents(
    baseUrl,
    incrementOntologyTypeVersion(version),
  );
};

const firstVersionOf = (typeId: VersionedUrl) =>
  versionedUrlFromComponents(extractBaseUrl(typeId), v1);

/** Type definitions from migration 026, which created the supply chain types. */
type SupplyChainTypes = {
  propertyTypes: Map<VersionedUrl, PropertyType>;
  entityTypes: Map<VersionedUrl, EntityType>;
};

/** Runs 026 with type creation mocked, to read the types it creates at their first version. */
const readSupplyChainTypes = async (): Promise<SupplyChainTypes> => {
  const propertyTypes = new Map<VersionedUrl, PropertyType>();
  const entityTypes = new Map<VersionedUrl, EntityType>();
  const created =
    (kind: "data-type" | "property-type" | "entity-type") =>
    (title: string) => {
      const baseUrl = util.generateSystemTypeBaseUrl({
        kind,
        title,
        shortname: "h",
      });
      return { baseUrl, typeId: versionedUrlFromComponents(baseUrl, v1) };
    };

  vi.mocked(util.createSystemDataTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { dataTypeDefinition }) => {
      const { baseUrl, typeId } = created("data-type")(
        dataTypeDefinition.title,
      );
      return {
        schema: { ...dataTypeDefinition, $id: typeId },
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as DataTypeWithMetadata;
    },
  );
  vi.mocked(util.createSystemPropertyTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { propertyTypeDefinition }) => {
      const { baseUrl, typeId } = created("property-type")(
        propertyTypeDefinition.title,
      );
      const schema = util.generateSystemPropertyTypeSchema({
        ...propertyTypeDefinition,
        propertyTypeId: typeId,
      });
      propertyTypes.set(typeId, schema);
      return {
        schema,
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as PropertyTypeWithMetadata;
    },
  );
  vi.mocked(util.createSystemEntityTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { entityTypeDefinition }) => {
      const { baseUrl, typeId } = created("entity-type")(
        entityTypeDefinition.title,
      );
      const schema = util.generateSystemEntityTypeSchema({
        ...entityTypeDefinition,
        entityTypeId: typeId,
      });
      entityTypes.set(typeId, schema);
      return {
        schema,
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as EntityTypeWithMetadata;
    },
  );

  await supplyChainMigration({
    context: {} as Parameters<MigrationFunction>[0]["context"],
    authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
    migrationState: {
      // 026 seeds its currencies' data types in an earlier migration: every data type is at its first version then.
      dataTypeVersions: new Proxy({}, { get: () => v1 }),
      propertyTypeVersions: {},
      entityTypeVersions: {},
    },
  });

  return { propertyTypes, entityTypes };
};

const propertyReferences = (schema: EntityType) =>
  Object.values(schema.properties).map((property) =>
    "items" in property ? property.items.$ref : property.$ref,
  );

const entityTypeReferences = (schema: EntityType) => [
  ...(schema.allOf ?? []).map(({ $ref }) => $ref),
  ...Object.entries(schema.links ?? {}).flatMap(([linkTypeId, link]) => [
    linkTypeId as VersionedUrl,
    ...("oneOf" in link.items ? link.items.oneOf.map(({ $ref }) => $ref) : []),
  ]),
];

const dataTypeReferences = (schema: PropertyType) =>
  schema.oneOf.flatMap((value) => ("$ref" in value ? [value.$ref] : []));

const upgradedPropertyTypeIds = upgradedPropertyTypeKeys.map(
  (key) => systemPropertyTypes[key].propertyTypeId,
);
const upgradedEntityTypeIds: VersionedUrl[] = upgradedEntityTypeKeys.map(
  (key) =>
    key in systemLinkEntityTypes
      ? systemLinkEntityTypes[key as keyof typeof systemLinkEntityTypes]
          .linkEntityTypeId
      : systemEntityTypes[key as keyof typeof systemEntityTypes].entityTypeId,
);

/** The state 038 leaves: units at the versions 034 created, the supply chain types at their first version. */
const stateBeforeMigration = (): MigrationState => ({
  dataTypeVersions: Object.fromEntries(
    [...archivedLengthGroupKeys, ...upgradedUnitKeys].map((key) => {
      const { baseUrl, version } = componentsFromVersionedUrl(
        systemDataTypes[key].dataTypeId,
      );
      return [baseUrl, version];
    }),
  ),
  propertyTypeVersions: Object.fromEntries(
    upgradedPropertyTypeIds.map((typeId) => [extractBaseUrl(typeId), v1]),
  ),
  entityTypeVersions: Object.fromEntries(
    upgradedEntityTypeIds.map((typeId) => [extractBaseUrl(typeId), v1]),
  ),
});

const runMigration = async (supplyChainTypes: SupplyChainTypes) => {
  vi.mocked(getPropertyTypeById).mockImplementation(
    async (_graphApi, _authentication, { propertyTypeId }) => {
      const schema = supplyChainTypes.propertyTypes.get(propertyTypeId);
      return schema
        ? ({ schema } as unknown as PropertyTypeWithMetadata)
        : null;
    },
  );
  vi.mocked(getEntityTypeById).mockImplementation(
    async (_graphApi, _authentication, { entityTypeId }) => {
      const schema = supplyChainTypes.entityTypes.get(entityTypeId);
      return schema ? ({ schema } as unknown as EntityTypeWithMetadata) : null;
    },
  );
  vi.mocked(util.updateSystemPropertyType).mockImplementation(
    async (_context, _authentication, { currentPropertyTypeId }) => ({
      updatedPropertyTypeId: nextVersionOf(currentPropertyTypeId),
    }),
  );
  vi.mocked(util.updateSystemEntityType).mockImplementation(
    async (_context, _authentication, { currentEntityTypeId }) => ({
      updatedEntityTypeId: nextVersionOf(currentEntityTypeId),
    }),
  );

  await migrate({
    context: {} as Parameters<MigrationFunction>[0]["context"],
    authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
    migrationState: stateBeforeMigration(),
  });
};

describe("moving supply chain types to current units", () => {
  let supplyChainTypes: SupplyChainTypes;

  beforeEach(async () => {
    vi.clearAllMocks();
    instance.isSelfHostedInstance = false;
    supplyChainTypes = await readSupplyChainTypes();
    vi.mocked(getDataTypeById).mockImplementation(
      async (_graphApi, _authentication, { dataTypeId }) =>
        ({ schema: { $id: dataTypeId } }) as unknown as DataTypeWithMetadata,
    );
  });

  it("archives the first version of the three length groups", async () => {
    await runMigration(supplyChainTypes);

    expect(
      vi
        .mocked(archiveDataType)
        .mock.calls.map(([, , { dataTypeId }]) => dataTypeId),
    ).toEqual([
      "https://hash.ai/@h/types/data-type/metric-length-si/v/1",
      "https://hash.ai/@h/types/data-type/imperial-length-uk/v/1",
      "https://hash.ai/@h/types/data-type/imperial-length-us/v/1",
    ]);
  });

  it("skips a length group that is already archived or does not exist", async () => {
    vi.mocked(getDataTypeById).mockImplementation(
      async (_graphApi, _authentication, { dataTypeId }) =>
        dataTypeId.includes("imperial-length-uk")
          ? null
          : ({
              schema: { $id: dataTypeId },
            } as unknown as DataTypeWithMetadata),
    );

    await runMigration(supplyChainTypes);

    expect(
      vi
        .mocked(archiveDataType)
        .mock.calls.map(([, , { dataTypeId }]) => dataTypeId),
    ).toEqual([
      "https://hash.ai/@h/types/data-type/metric-length-si/v/1",
      "https://hash.ai/@h/types/data-type/imperial-length-us/v/1",
    ]);
  });

  it("leaves the length groups on a self-hosted instance, which holds them as external types", async () => {
    instance.isSelfHostedInstance = true;

    await runMigration(supplyChainTypes);

    expect(archiveDataType).not.toHaveBeenCalled();
    expect(util.updateSystemPropertyType).toHaveBeenCalledTimes(
      upgradedPropertyTypeKeys.length,
    );
  });

  it("upgrades every 026 property type with a unit that 034 gave a new version", async () => {
    const seededBy034 = new Set<string>();
    vi.mocked(ensureUnitDataType).mockImplementation(
      async (
        _context,
        _authentication,
        { dataTypeDefinition, dataTypeBaseUrl },
      ) => {
        const baseUrl =
          dataTypeBaseUrl ??
          util.generateSystemTypeBaseUrl({
            kind: "data-type",
            title: dataTypeDefinition.title,
            shortname: "h",
          });
        seededBy034.add(baseUrl);
        return {
          schema: {
            ...dataTypeDefinition,
            $id: versionedUrlFromComponents(baseUrl, v1),
          },
          metadata: { recordId: { baseUrl, version: v1 } },
        } as unknown as DataTypeWithMetadata;
      },
    );
    await siUnitMigration({
      context: {} as Parameters<MigrationFunction>[0]["context"],
      authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
      migrationState: {
        dataTypeVersions: {},
        propertyTypeVersions: {},
        entityTypeVersions: {},
      },
    });

    const movedUnitsInUse = new Set(
      [...supplyChainTypes.propertyTypes.values()]
        .flatMap(dataTypeReferences)
        .map(extractBaseUrl)
        .filter((baseUrl) => seededBy034.has(baseUrl)),
    );
    expect(movedUnitsInUse).toEqual(
      new Set(
        upgradedUnitKeys.map((key) => systemDataTypes[key].dataTypeBaseUrl),
      ),
    );

    const propertyTypesWithMovedUnits = [
      ...supplyChainTypes.propertyTypes.entries(),
    ]
      .filter(([, schema]) =>
        dataTypeReferences(schema).some((dataTypeId) =>
          movedUnitsInUse.has(extractBaseUrl(dataTypeId)),
        ),
      )
      .map(([typeId]) => typeId);
    expect(new Set(propertyTypesWithMovedUnits)).toEqual(
      new Set(upgradedPropertyTypeIds.map(firstVersionOf)),
    );
  });

  it("points the property types at the current version of every unit", async () => {
    await runMigration(supplyChainTypes);

    const calls = vi.mocked(util.updateSystemPropertyType).mock.calls;
    expect(
      calls.map(([, , { currentPropertyTypeId }]) => currentPropertyTypeId),
    ).toEqual(upgradedPropertyTypeIds.map(firstVersionOf));

    const currentDataTypeIds = new Set<VersionedUrl>(
      Object.values(systemDataTypes).map(({ dataTypeId }) => dataTypeId),
    );
    for (const [, , { currentPropertyTypeId, newSchema }] of calls) {
      const previous = supplyChainTypes.propertyTypes.get(
        currentPropertyTypeId,
      )!;
      const references = dataTypeReferences(newSchema as PropertyType);
      expect(references.length, currentPropertyTypeId).toBe(
        dataTypeReferences(previous).length,
      );
      for (const dataTypeId of references) {
        expect(currentDataTypeIds.has(dataTypeId), dataTypeId).toBe(true);
      }
      expect(newSchema.title).toBe(previous.title);
      expect(newSchema.description).toBe(previous.description);
    }

    const orderQuantity = calls.find(
      ([, , { currentPropertyTypeId }]) =>
        currentPropertyTypeId ===
        firstVersionOf(systemPropertyTypes.orderQuantity.propertyTypeId),
    )!;
    expect(
      dataTypeReferences(orderQuantity[2].newSchema as PropertyType),
    ).toEqual(
      expect.arrayContaining([
        "https://hash.ai/@h/types/data-type/meters/v/2",
        "https://hash.ai/@h/types/data-type/miles/v/2",
        "https://hash.ai/@h/types/data-type/kilograms/v/2",
        systemDataTypes.unit.dataTypeId,
      ]),
    );
  });

  it("upgrades every entity type that uses them, and every type that refers to those", () => {
    const upgradedPropertyTypes = new Set<VersionedUrl>(
      upgradedPropertyTypeIds.map(firstVersionOf),
    );
    const usingProperties = [...supplyChainTypes.entityTypes.entries()]
      .filter(([, schema]) =>
        propertyReferences(schema).some((typeId) =>
          upgradedPropertyTypes.has(typeId),
        ),
      )
      .map(([typeId]) => typeId);

    const closure = new Set(usingProperties);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [typeId, schema] of supplyChainTypes.entityTypes) {
        if (
          !closure.has(typeId) &&
          entityTypeReferences(schema).some((reference) =>
            closure.has(reference),
          )
        ) {
          closure.add(typeId);
          grew = true;
        }
      }
    }

    expect(new Set(upgradedEntityTypeIds.map(firstVersionOf))).toEqual(closure);
  });

  it("points the entity types at the new property types and at each other's new versions", async () => {
    await runMigration(supplyChainTypes);

    const calls = vi.mocked(util.updateSystemEntityType).mock.calls;
    expect(
      calls.map(([, , { currentEntityTypeId }]) => currentEntityTypeId),
    ).toEqual(upgradedEntityTypeIds.map(firstVersionOf));

    const previousPropertyTypeIds = new Set<VersionedUrl>(
      upgradedPropertyTypeIds.map(firstVersionOf),
    );
    const previousEntityTypeIds = new Set<VersionedUrl>(
      upgradedEntityTypeIds.map(firstVersionOf),
    );

    for (const [, , { currentEntityTypeId, newSchema }] of calls) {
      const previous = supplyChainTypes.entityTypes.get(currentEntityTypeId)!;
      expect(Object.keys(newSchema.properties)).toEqual(
        Object.keys(previous.properties),
      );
      expect(propertyReferences(newSchema), currentEntityTypeId).toEqual(
        propertyReferences(previous).map((reference) =>
          previousPropertyTypeIds.has(reference)
            ? nextVersionOf(reference)
            : reference,
        ),
      );
      expect(entityTypeReferences(newSchema)).toEqual(
        entityTypeReferences(previous).map((reference) =>
          previousEntityTypeIds.has(reference)
            ? nextVersionOf(reference)
            : reference,
        ),
      );
    }
  });

  it("upgrades each entity type after the types it refers to, so that every reference exists", async () => {
    await runMigration(supplyChainTypes);

    const created = new Set<VersionedUrl>();
    for (const [, , { currentEntityTypeId, newSchema }] of vi.mocked(
      util.updateSystemEntityType,
    ).mock.calls) {
      const nextId = nextVersionOf(currentEntityTypeId);
      for (const reference of entityTypeReferences(newSchema)) {
        if (upgradedEntityTypeIds.includes(reference) && reference !== nextId) {
          expect(created.has(reference), `${nextId} -> ${reference}`).toBe(
            true,
          );
        }
      }
      created.add(nextId);
    }
  });
});
