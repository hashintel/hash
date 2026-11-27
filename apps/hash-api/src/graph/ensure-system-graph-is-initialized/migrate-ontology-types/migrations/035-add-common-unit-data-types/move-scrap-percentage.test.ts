import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  componentsFromVersionedUrl,
  incrementOntologyTypeVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { getPropertyTypeById } from "@local/hash-graph-sdk/property-type";
import {
  systemDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import * as util from "../../util";
import supplyChainMigration from "../026-add-supply-chain-types.migration";
import supplyChainSettingsMigration from "../028-add-supply-chain-view-feedback-and-settings.migration";
import {
  moveScrapPercentage,
  scrapPercentageEntityTypeKeys,
} from "./move-scrap-percentage";

import type { MigrationFunction, MigrationState } from "../../types";
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

vi.mock("@local/hash-graph-sdk/entity-type", () => ({
  getEntityTypeById: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/property-type", () => ({
  getPropertyTypeById: vi.fn(),
}));

vi.mock("../../util", async (importOriginal) => {
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
const v2 = makeOntologyTypeVersion({ major: 2 });

const nextVersionOf = (typeId: VersionedUrl) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeId);
  return versionedUrlFromComponents(
    baseUrl,
    incrementOntologyTypeVersion(version),
  );
};

const atVersion = (baseUrl: BaseUrl, version: OntologyTypeVersion) =>
  versionedUrlFromComponents(baseUrl, version);

/** Every version of the property and entity types 026 and 028 create, and the move then creates. */
type OntologyTypes = {
  propertyTypes: Map<VersionedUrl, PropertyType>;
  entityTypes: Map<VersionedUrl, EntityType>;
};

const context = {} as Parameters<MigrationFunction>[0]["context"];
const authentication = {} as Parameters<MigrationFunction>[0]["authentication"];

/** Types from earlier migrations are given their first version: 026 and 028 refer to them, but the version does not matter here. */
const atFirstVersionUnlessSet = (
  versions: Record<BaseUrl, OntologyTypeVersion>,
) =>
  new Proxy(versions, {
    get: (target, key) => target[key as BaseUrl] ?? v1,
  });

/** Runs 026 and 028 with type creation mocked, to read the supply chain types they create. */
const readSupplyChainTypes = async (): Promise<OntologyTypes> => {
  const types: OntologyTypes = {
    propertyTypes: new Map(),
    entityTypes: new Map(),
  };

  const created = (kind: "property-type" | "entity-type", title: string) => {
    const baseUrl = util.generateSystemTypeBaseUrl({
      kind,
      title,
      shortname: "h",
    });
    return { baseUrl, typeId: atVersion(baseUrl, v1) };
  };

  vi.mocked(util.createSystemDataTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { dataTypeDefinition }) => {
      const baseUrl = util.generateSystemTypeBaseUrl({
        kind: "data-type",
        title: dataTypeDefinition.title,
        shortname: "h",
      });
      return {
        schema: { ...dataTypeDefinition, $id: atVersion(baseUrl, v1) },
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as DataTypeWithMetadata;
    },
  );
  vi.mocked(util.createSystemPropertyTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { propertyTypeDefinition }) => {
      const { baseUrl, typeId } = created(
        "property-type",
        propertyTypeDefinition.title,
      );
      const schema = util.generateSystemPropertyTypeSchema({
        ...propertyTypeDefinition,
        propertyTypeId: typeId,
      });
      types.propertyTypes.set(typeId, schema);
      return {
        schema,
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as PropertyTypeWithMetadata;
    },
  );
  vi.mocked(util.createSystemEntityTypeIfNotExists).mockImplementation(
    async (_context, _authentication, { entityTypeDefinition }) => {
      const { baseUrl, typeId } = created(
        "entity-type",
        entityTypeDefinition.title,
      );
      const schema = util.generateSystemEntityTypeSchema({
        ...entityTypeDefinition,
        entityTypeId: typeId,
      });
      types.entityTypes.set(typeId, schema);
      return {
        schema,
        metadata: { recordId: { baseUrl, version: v1 } },
      } as unknown as EntityTypeWithMetadata;
    },
  );

  for (const migration of [
    supplyChainMigration,
    supplyChainSettingsMigration,
  ]) {
    await migration({
      context,
      authentication,
      migrationState: {
        dataTypeVersions: atFirstVersionUnlessSet({}),
        propertyTypeVersions: atFirstVersionUnlessSet({}),
        entityTypeVersions: atFirstVersionUnlessSet({}),
      },
    });
  }

  return types;
};

/** Reads types from, and records the versions the move creates into, the given types, as the graph would. */
const mockGraph = (types: OntologyTypes) => {
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
      types.propertyTypes.set(updatedPropertyTypeId, {
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
      types.entityTypes.set(updatedEntityTypeId, {
        ...newSchema,
        $id: updatedEntityTypeId,
      });
      const { entityTypeVersions } = migrationState;
      entityTypeVersions[baseUrl] = version;
      return { updatedEntityTypeId };
    },
  );
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

const scrapPercentage = systemPropertyTypes.scrapPercentage.propertyTypeBaseUrl;
const percentage = componentsFromVersionedUrl(
  systemDataTypes.percentage.dataTypeId,
);
const movedEntityTypeBaseUrls = scrapPercentageEntityTypeKeys.map(
  (key) => systemEntityTypes[key].entityTypeBaseUrl,
);

/** The state after 035 has seeded its units, with the moved types at the given version. */
const stateWithMovedTypesAt = (
  entityTypeVersion: OntologyTypeVersion,
): MigrationState => ({
  dataTypeVersions: { [percentage.baseUrl]: percentage.version },
  propertyTypeVersions: { [scrapPercentage]: v1 },
  entityTypeVersions: Object.fromEntries(
    movedEntityTypeBaseUrls.map((baseUrl) => [baseUrl, entityTypeVersion]),
  ),
});

describe("moving `Scrap Percentage` to the current `Percentage`", () => {
  let types: OntologyTypes;

  beforeEach(async () => {
    vi.clearAllMocks();
    types = await readSupplyChainTypes();
    mockGraph(types);
  });

  it("starts from the first version of `Percentage`, which the registry has moved past", () => {
    expect(percentage.version).not.toEqual(v1);
    expect(
      dataTypeReferences(
        types.propertyTypes.get(atVersion(scrapPercentage, v1))!,
      ),
    ).toEqual([atVersion(percentage.baseUrl, v1)]);
  });

  it("moves every entity type that uses `Scrap Percentage`, and every type that refers to those", () => {
    const closure = new Set<VersionedUrl>(
      [...types.entityTypes]
        .filter(([, schema]) =>
          propertyReferences(schema).includes(atVersion(scrapPercentage, v1)),
        )
        .map(([typeId]) => typeId),
    );
    let grew = true;
    while (grew) {
      grew = false;
      for (const [typeId, schema] of types.entityTypes) {
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

    expect(closure).toEqual(
      new Set(movedEntityTypeBaseUrls.map((baseUrl) => atVersion(baseUrl, v1))),
    );
  });

  it("points `Scrap Percentage` at the current `Percentage`", async () => {
    await moveScrapPercentage({
      context,
      authentication,
      migrationState: stateWithMovedTypesAt(v1),
    });

    const calls = vi.mocked(util.updateSystemPropertyType).mock.calls;
    expect(
      calls.map(([, , { currentPropertyTypeId }]) => currentPropertyTypeId),
    ).toEqual([atVersion(scrapPercentage, v1)]);

    const previous = types.propertyTypes.get(atVersion(scrapPercentage, v1))!;
    const [[, , { newSchema }]] = calls as [(typeof calls)[number]];
    expect(dataTypeReferences(newSchema as PropertyType)).toEqual([
      systemDataTypes.percentage.dataTypeId,
    ]);
    expect(newSchema.title).toBe(previous.title);
    expect(newSchema.description).toBe(previous.description);
  });

  it("points the entity types at the new `Scrap Percentage` and at each other's new versions, in order", async () => {
    await moveScrapPercentage({
      context,
      authentication,
      migrationState: stateWithMovedTypesAt(v1),
    });

    const calls = vi.mocked(util.updateSystemEntityType).mock.calls;
    expect(
      calls.map(([, , { currentEntityTypeId }]) => currentEntityTypeId),
    ).toEqual(movedEntityTypeBaseUrls.map((baseUrl) => atVersion(baseUrl, v1)));

    const replacements = new Map<VersionedUrl, VersionedUrl>([
      [atVersion(scrapPercentage, v1), atVersion(scrapPercentage, v2)],
      ...movedEntityTypeBaseUrls.map(
        (baseUrl) => [atVersion(baseUrl, v1), atVersion(baseUrl, v2)] as const,
      ),
    ]);

    for (const [, , { currentEntityTypeId, newSchema }] of calls) {
      const previous = types.entityTypes.get(currentEntityTypeId)!;
      expect(propertyReferences(newSchema), currentEntityTypeId).toEqual(
        propertyReferences(previous).map(
          (reference) => replacements.get(reference) ?? reference,
        ),
      );
      expect(entityTypeReferences(newSchema), currentEntityTypeId).toEqual(
        entityTypeReferences(previous).map(
          (reference) => replacements.get(reference) ?? reference,
        ),
      );
    }

    const billOfMaterials = types.entityTypes.get(
      atVersion(systemEntityTypes.billOfMaterials.entityTypeBaseUrl, v2),
    )!;
    expect(entityTypeReferences(billOfMaterials)).toContain(
      atVersion(systemEntityTypes.billOfMaterialsItem.entityTypeBaseUrl, v2),
    );
  });

  it("moves each entity type from its current version, such as the one 039 created where it has already run", async () => {
    for (const baseUrl of movedEntityTypeBaseUrls) {
      const schema = types.entityTypes.get(atVersion(baseUrl, v1))!;
      types.entityTypes.set(atVersion(baseUrl, v2), {
        ...schema,
        $id: atVersion(baseUrl, v2),
      });
    }

    const migrationState = stateWithMovedTypesAt(v2);
    await moveScrapPercentage({ context, authentication, migrationState });

    expect(
      vi
        .mocked(util.updateSystemEntityType)
        .mock.calls.map(([, , { currentEntityTypeId }]) => currentEntityTypeId),
    ).toEqual(movedEntityTypeBaseUrls.map((baseUrl) => atVersion(baseUrl, v2)));

    const v3 = makeOntologyTypeVersion({ major: 3 });
    expect(migrationState.entityTypeVersions).toEqual(
      Object.fromEntries(
        movedEntityTypeBaseUrls.map((baseUrl) => [baseUrl, v3]),
      ),
    );
    expect(
      entityTypeReferences(
        types.entityTypes.get(
          atVersion(systemEntityTypes.billOfMaterials.entityTypeBaseUrl, v3),
        )!,
      ),
    ).toContain(
      atVersion(systemEntityTypes.billOfMaterialsItem.entityTypeBaseUrl, v3),
    );
  });

  it("leaves the registry at the versions a new instance reaches, where 039 then moves the entity types once more", () => {
    expect(systemPropertyTypes.scrapPercentage.propertyTypeId).toBe(
      atVersion(scrapPercentage, v2),
    );
    for (const key of scrapPercentageEntityTypeKeys) {
      expect(systemEntityTypes[key].entityTypeId).toBe(
        atVersion(
          systemEntityTypes[key].entityTypeBaseUrl,
          makeOntologyTypeVersion({ major: 3 }),
        ),
      );
    }
  });
});
