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
import flowTypesMigration from "./024-add-flow-types.migration";
import supplyChainMigration from "./026-add-supply-chain-types.migration";
import petriNetsMigration from "./027-add-petri-nets.migration";
import supplyChainSettingsMigration from "./028-add-supply-chain-view-feedback-and-settings.migration";
import dashboardsMigration from "./029-create-dashboard-types.migration";
import statusMentionsMigration from "./030-add-status-mentions.migration";
import flowDefinitionMigration from "./032-update-flow-definition-type.migration";
import openInputRequestsMigration from "./033-add-open-input-requests-to-flow-run.migration";
import siUnitMigration from "./034-add-si-unit-data-types.migration";
import { ensureUnitDataType } from "./034-add-si-unit-data-types/ensure-unit-data-type";
import { moveScrapPercentage } from "./035-add-common-unit-data-types/move-scrap-percentage";
import migrate, {
  archivedLengthGroupBaseUrls,
  upgradedEntityTypeKeys,
  upgradedPropertyTypeKeys,
  upgradedUnitKeys,
} from "./039-move-supply-chain-types-to-current-units.migration";

import type { MigrationFunction, MigrationState } from "../types";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityType,
  EntityTypeWithMetadata,
  OntologyTypeVersion,
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
vi.mock("@local/hash-graph-sdk/policy", () => ({
  // 032 creates a policy only when none exists.
  queryPolicies: vi.fn(async () => [{}]),
  createPolicy: vi.fn(),
}));
vi.mock("../../../ontology/primitive/data-type", () => ({
  archiveDataType: vi.fn(),
}));
vi.mock("../../../knowledge/system-types/org", () => ({
  getOrgByShortname: vi.fn(async () => ({ webId: "h" })),
}));
vi.mock("../flow-definition-snapshots", () => ({
  readFlowDefinitionSnapshot: vi.fn(async () => []),
}));
vi.mock("../seed-flow-definitions", () => ({
  seedFlowDefinitions: vi.fn(),
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
    upgradeDependenciesInHashEntityType: vi.fn(),
    upgradeEntitiesToNewTypeVersion: vi.fn(),
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

/** The version before a type's version in the registry, which holds the version 039 creates. */
const previousVersionOf = (typeId: VersionedUrl) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeId);
  return versionedUrlFromComponents(
    baseUrl,
    makeOntologyTypeVersion({
      major: Number.parseInt(version.toString(), 10) - 1,
    }),
  );
};

/**
 * The migrations after 023, which created `Duration` and its units, and before 034 that create or change property or
 * entity types. 025 creates only data types, and 031 only moves entities.
 */
const typeMigrations = [
  flowTypesMigration,
  supplyChainMigration,
  petriNetsMigration,
  supplyChainSettingsMigration,
  dashboardsMigration,
  statusMentionsMigration,
  flowDefinitionMigration,
  openInputRequestsMigration,
];

/** Every version of the property and entity types those migrations, then 035 and 039, create. */
type OntologyTypes = {
  propertyTypes: Map<VersionedUrl, PropertyType>;
  entityTypes: Map<VersionedUrl, EntityType>;
  /** The version of each of them before 039, which 035 runs before on a new instance. */
  propertyTypeVersions: Record<BaseUrl, OntologyTypeVersion>;
  entityTypeVersions: Record<BaseUrl, OntologyTypeVersion>;
};

/** Records the types created and updated through the mocked type functions, as the real ones would. */
const recordTypeChanges = ({ propertyTypes, entityTypes }: OntologyTypes) => {
  vi.mocked(util.updateSystemPropertyType).mockImplementation(
    async (
      _context,
      _authentication,
      { currentPropertyTypeId, newSchema, migrationState },
    ) => {
      const updatedPropertyTypeId = nextVersionOf(currentPropertyTypeId);
      const { baseUrl, version } = componentsFromVersionedUrl(
        updatedPropertyTypeId,
      );
      propertyTypes.set(updatedPropertyTypeId, {
        ...newSchema,
        $id: updatedPropertyTypeId,
      } as PropertyType);
      const { propertyTypeVersions } = migrationState;
      propertyTypeVersions[baseUrl] = version;
      return { updatedPropertyTypeId };
    },
  );
  vi.mocked(util.updateSystemEntityType).mockImplementation(
    async (
      _context,
      _authentication,
      { currentEntityTypeId, newSchema, migrationState },
    ) => {
      const updatedEntityTypeId = nextVersionOf(currentEntityTypeId);
      const { baseUrl, version } =
        componentsFromVersionedUrl(updatedEntityTypeId);
      entityTypes.set(updatedEntityTypeId, {
        ...newSchema,
        $id: updatedEntityTypeId,
      });
      const { entityTypeVersions } = migrationState;
      entityTypeVersions[baseUrl] = version;
      return { updatedEntityTypeId };
    },
  );
};

/**
 * Runs the migrations from 024 to 033, then 035's move of `Scrap Percentage`, with type creation mocked, to read the
 * types they create or change.
 */
const readTypes = async (): Promise<OntologyTypes> => {
  const types: OntologyTypes = {
    propertyTypes: new Map(),
    entityTypes: new Map(),
    propertyTypeVersions: {},
    entityTypeVersions: {},
  };
  const dataTypeVersions: Record<BaseUrl, OntologyTypeVersion> = {};

  /**
   * Types from earlier migrations are given their first version: these migrations refer to them, but the version
   * does not matter here. Data types are all at their first version before 034.
   */
  const atFirstVersionUnlessSet = (
    versions: Record<BaseUrl, OntologyTypeVersion>,
  ) =>
    new Proxy(versions, {
      get: (target, key) => target[key as BaseUrl] ?? v1,
    });

  const migrationState: MigrationState = {
    dataTypeVersions: atFirstVersionUnlessSet(dataTypeVersions),
    propertyTypeVersions: atFirstVersionUnlessSet(types.propertyTypeVersions),
    entityTypeVersions: atFirstVersionUnlessSet(types.entityTypeVersions),
  };

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
      dataTypeVersions[baseUrl] = v1;
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
      types.propertyTypes.set(typeId, schema);
      types.propertyTypeVersions[baseUrl] = v1;
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
      types.entityTypes.set(typeId, schema);
      types.entityTypeVersions[baseUrl] = v1;
      return {
        schema,
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as EntityTypeWithMetadata;
    },
  );
  /** A type these migrations change but did not create, such as `Usage Record`, is read as one with no properties. */
  vi.mocked(getEntityTypeById).mockImplementation(
    async (_graphApi, _authentication, { entityTypeId }) =>
      ({
        schema: types.entityTypes.get(entityTypeId) ?? {
          $id: entityTypeId,
          properties: {},
        },
      }) as unknown as EntityTypeWithMetadata,
  );
  vi.mocked(getPropertyTypeById).mockImplementation(
    async (_graphApi, _authentication, { propertyTypeId }) =>
      ({
        schema: types.propertyTypes.get(propertyTypeId),
      }) as unknown as PropertyTypeWithMetadata,
  );
  recordTypeChanges(types);

  for (const typeMigration of typeMigrations) {
    await typeMigration({
      context: {} as Parameters<MigrationFunction>[0]["context"],
      authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
      migrationState,
    });
  }

  /** 035 gives `Percentage` the version in the registry, then moves `Scrap Percentage` and its entity types onto it. */
  const { baseUrl: percentageBaseUrl, version: percentageVersion } =
    componentsFromVersionedUrl(systemDataTypes.percentage.dataTypeId);
  dataTypeVersions[percentageBaseUrl] = percentageVersion;
  await moveScrapPercentage({
    context: {} as Parameters<MigrationFunction>[0]["context"],
    authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
    migrationState,
  });

  vi.clearAllMocks();

  return types;
};

/** The schemas of a type map that are at the given versions. */
const atVersions = <Schema>(
  schemas: Map<VersionedUrl, Schema>,
  versions: Record<BaseUrl, OntologyTypeVersion>,
) =>
  [...schemas].filter(([typeId]) => {
    const { baseUrl, version } = componentsFromVersionedUrl(typeId);
    return versions[baseUrl] === version;
  });

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

/** The state before 039: units at the versions 034 created, other types at the versions 024 to 033 leave. */
const stateBeforeMigration = (types: OntologyTypes): MigrationState => ({
  dataTypeVersions: Object.fromEntries([
    ...archivedLengthGroupBaseUrls.map((baseUrl) => [baseUrl, v1]),
    ...upgradedUnitKeys.map((key) => {
      const { baseUrl, version } = componentsFromVersionedUrl(
        systemDataTypes[key].dataTypeId,
      );
      return [baseUrl, version];
    }),
  ]),
  propertyTypeVersions: { ...types.propertyTypeVersions },
  entityTypeVersions: { ...types.entityTypeVersions },
});

/** Runs 039, and returns the state it leaves. */
const runMigration = async (types: OntologyTypes) => {
  vi.mocked(getPropertyTypeById).mockImplementation(
    async (_graphApi, _authentication, { propertyTypeId }) => {
      const schema = types.propertyTypes.get(propertyTypeId);
      return schema
        ? ({ schema } as unknown as PropertyTypeWithMetadata)
        : null;
    },
  );
  vi.mocked(getEntityTypeById).mockImplementation(
    async (_graphApi, _authentication, { entityTypeId }) => {
      const schema = types.entityTypes.get(entityTypeId);
      return schema ? ({ schema } as unknown as EntityTypeWithMetadata) : null;
    },
  );
  recordTypeChanges(types);

  return migrate({
    context: {} as Parameters<MigrationFunction>[0]["context"],
    authentication: {} as Parameters<MigrationFunction>[0]["authentication"],
    migrationState: stateBeforeMigration(types),
  });
};

/** Runs 034 with unit creation mocked, to read the base URLs of the units it creates or gives new versions. */
const readUnitsSeededBy034 = async () => {
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
  return seededBy034;
};

describe("moving types to current units", () => {
  let types: OntologyTypes;

  beforeEach(async () => {
    vi.clearAllMocks();
    instance.isSelfHostedInstance = false;
    types = await readTypes();
    vi.mocked(getDataTypeById).mockImplementation(
      async (_graphApi, _authentication, { dataTypeId }) =>
        ({ schema: { $id: dataTypeId } }) as unknown as DataTypeWithMetadata,
    );
  });

  it("archives the first version of the three length groups", async () => {
    await runMigration(types);

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

    await runMigration(types);

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

    await runMigration(types);

    expect(archiveDataType).not.toHaveBeenCalled();
    expect(util.updateSystemPropertyType).toHaveBeenCalledTimes(
      upgradedPropertyTypeKeys.length,
    );
  });

  it("upgrades every property type with a data type that 034 gave a new version", async () => {
    const seededBy034 = await readUnitsSeededBy034();

    const propertyTypesBefore039 = atVersions(
      types.propertyTypes,
      types.propertyTypeVersions,
    );

    const movedUnitsInUse = new Set(
      propertyTypesBefore039
        .flatMap(([, schema]) => dataTypeReferences(schema))
        .map(extractBaseUrl)
        .filter((baseUrl) => seededBy034.has(baseUrl)),
    );
    expect(movedUnitsInUse).toEqual(
      new Set(
        upgradedUnitKeys.map((key) => systemDataTypes[key].dataTypeBaseUrl),
      ),
    );

    const propertyTypesWithMovedUnits = propertyTypesBefore039
      .filter(([, schema]) =>
        dataTypeReferences(schema).some((dataTypeId) =>
          movedUnitsInUse.has(extractBaseUrl(dataTypeId)),
        ),
      )
      .map(([typeId]) => typeId);
    expect(new Set(propertyTypesWithMovedUnits)).toEqual(
      new Set(upgradedPropertyTypeIds.map(previousVersionOf)),
    );
  });

  it("points the property types at the current version of every unit", async () => {
    await runMigration(types);

    const calls = vi.mocked(util.updateSystemPropertyType).mock.calls;
    expect(
      calls.map(([, , { currentPropertyTypeId }]) => currentPropertyTypeId),
    ).toEqual(upgradedPropertyTypeIds.map(previousVersionOf));

    const currentDataTypeIds = new Set<VersionedUrl>(
      Object.values(systemDataTypes).map(({ dataTypeId }) => dataTypeId),
    );
    for (const [, , { currentPropertyTypeId, newSchema }] of calls) {
      const previous = types.propertyTypes.get(currentPropertyTypeId)!;
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
        previousVersionOf(systemPropertyTypes.orderQuantity.propertyTypeId),
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
      upgradedPropertyTypeIds.map(previousVersionOf),
    );
    const entityTypesBefore039 = atVersions(
      types.entityTypes,
      types.entityTypeVersions,
    );
    const usingProperties = entityTypesBefore039
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
      for (const [typeId, schema] of entityTypesBefore039) {
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

    expect(new Set(upgradedEntityTypeIds.map(previousVersionOf))).toEqual(
      closure,
    );
  });

  it("points the entity types at the new property types and at each other's new versions", async () => {
    await runMigration(types);

    const calls = vi.mocked(util.updateSystemEntityType).mock.calls;
    expect(
      calls.map(([, , { currentEntityTypeId }]) => currentEntityTypeId),
    ).toEqual(upgradedEntityTypeIds.map(previousVersionOf));

    const previousPropertyTypeIds = new Set<VersionedUrl>(
      upgradedPropertyTypeIds.map(previousVersionOf),
    );
    const previousEntityTypeIds = new Set<VersionedUrl>(
      upgradedEntityTypeIds.map(previousVersionOf),
    );

    for (const [, , { currentEntityTypeId, newSchema }] of calls) {
      const previous = types.entityTypes.get(currentEntityTypeId)!;
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
    await runMigration(types);

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

  it("registers each type it upgrades at the version after the one before it", () => {
    for (const propertyTypeId of upgradedPropertyTypeIds) {
      const { baseUrl } = componentsFromVersionedUrl(propertyTypeId);
      expect(propertyTypeId).toBe(
        nextVersionOf(
          versionedUrlFromComponents(
            baseUrl,
            types.propertyTypeVersions[baseUrl]!,
          ),
        ),
      );
    }
    for (const entityTypeId of upgradedEntityTypeIds) {
      const { baseUrl } = componentsFromVersionedUrl(entityTypeId);
      expect(entityTypeId).toBe(
        nextVersionOf(
          versionedUrlFromComponents(
            baseUrl,
            types.entityTypeVersions[baseUrl]!,
          ),
        ),
      );
    }
  });

  it("moves `Schedule Catchup Window` onto the current `Millisecond`, and `Flow Schedule` onto it", async () => {
    await runMigration(types);

    expect(
      dataTypeReferences(
        types.propertyTypes.get(
          systemPropertyTypes.scheduleCatchupWindow.propertyTypeId,
        )!,
      ),
    ).toEqual([systemDataTypes.millisecond.dataTypeId]);

    const flowSchedule = types.entityTypes.get(
      systemEntityTypes.flowSchedule.entityTypeId,
    )!;
    expect(propertyReferences(flowSchedule)).toContain(
      systemPropertyTypes.scheduleCatchupWindow.propertyTypeId,
    );
    expect(entityTypeReferences(flowSchedule)).toEqual([
      systemEntityTypes.flowTrigger.entityTypeId,
    ]);
  });

  it("leaves no current type referring to an earlier version of a unit 034 re-versions, or of a type it upgrades", async () => {
    const seededBy034 = await readUnitsSeededBy034();
    const { propertyTypeVersions, entityTypeVersions } =
      await runMigration(types);

    const currentDataTypeIds = new Map<string, VersionedUrl>(
      Object.values(systemDataTypes).map(({ dataTypeBaseUrl, dataTypeId }) => [
        dataTypeBaseUrl,
        dataTypeId,
      ]),
    );
    const supersededTypeIds = new Set<VersionedUrl>(
      [...upgradedPropertyTypeIds, ...upgradedEntityTypeIds].map(
        previousVersionOf,
      ),
    );

    for (const [propertyTypeId, schema] of atVersions(
      types.propertyTypes,
      propertyTypeVersions,
    )) {
      for (const dataTypeId of dataTypeReferences(schema)) {
        expect(dataTypeId, propertyTypeId).not.toBe(
          "https://hash.ai/@h/types/data-type/duration/v/1",
        );
        expect(dataTypeId, propertyTypeId).not.toBe(
          "https://hash.ai/@h/types/data-type/millisecond/v/1",
        );
        const baseUrl = extractBaseUrl(dataTypeId);
        if (seededBy034.has(baseUrl)) {
          expect(dataTypeId, propertyTypeId).toBe(
            currentDataTypeIds.get(baseUrl),
          );
        }
      }
    }

    for (const [entityTypeId, schema] of atVersions(
      types.entityTypes,
      entityTypeVersions,
    )) {
      for (const reference of [
        ...propertyReferences(schema),
        ...entityTypeReferences(schema),
      ]) {
        expect(
          supersededTypeIds.has(reference),
          `${entityTypeId} -> ${reference}`,
        ).toBe(false);
      }
    }
  });
});
