import { extractBaseUrl } from "@blockprotocol/type-system";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { getPropertyTypeById } from "@local/hash-graph-sdk/property-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import {
  getCurrentHashDataTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  updateSystemPropertyType,
} from "../../util";
import { upgradeEntityTypeDependencies } from "../../util/upgrade-entity-type-dependencies";

import type { MigrationFunction } from "../../types";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * The entity types that use `Scrap Percentage`, and the types that refer to those: `Bill of Materials` links to its
 * items.
 *
 * A new version can only refer to types that exist, so each comes after every type it refers to.
 */
export const scrapPercentageEntityTypeKeys = [
  "billOfMaterialsItem",
  "billOfMaterials",
] as const satisfies (keyof typeof systemEntityTypes)[];

const replaceReferences = <Value>(
  value: Value,
  replacements: Map<string, VersionedUrl>,
): Value =>
  JSON.parse(JSON.stringify(value), (key, nested: unknown) =>
    key === "$ref" && typeof nested === "string"
      ? (replacements.get(extractBaseUrl(nested as VersionedUrl)) ?? nested)
      : nested,
  ) as Value;

/**
 * Moves `Scrap Percentage` from 026 onto the version of `Percentage` that this migration creates, then the entity types
 * that use it onto the new `Scrap Percentage`.
 *
 * Each type moves from its current version, which is the one 039 created where 039 has already run. Existing entities
 * keep their types and values: the first version of `Percentage` is not archived.
 */
export const moveScrapPercentage = async ({
  context,
  authentication,
  migrationState,
}: Parameters<MigrationFunction>[0]): Promise<void> => {
  const percentageDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "percentage",
    migrationState,
  });

  const currentPropertyTypeId = getCurrentHashPropertyTypeId({
    propertyTypeKey: "scrapPercentage",
    migrationState,
  });

  const currentPropertyType = await getPropertyTypeById(
    context.graphApi,
    authentication,
    {
      propertyTypeId: currentPropertyTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!currentPropertyType) {
    throw new Error(`Expected property type ${currentPropertyTypeId} to exist`);
  }

  const { $id: _, ...propertyTypeSchema }: PropertyType =
    currentPropertyType.schema;

  const { updatedPropertyTypeId } = await updateSystemPropertyType(
    context,
    authentication,
    {
      currentPropertyTypeId,
      migrationState,
      newSchema: {
        ...propertyTypeSchema,
        oneOf: replaceReferences(
          propertyTypeSchema.oneOf,
          new Map([
            [extractBaseUrl(percentageDataTypeId), percentageDataTypeId],
          ]),
        ),
      },
    },
  );

  const propertyTypeReplacements = new Map<string, VersionedUrl>([
    [extractBaseUrl(updatedPropertyTypeId), updatedPropertyTypeId],
  ]);

  const upgradedEntityTypeIds: VersionedUrl[] = [];

  for (const entityTypeKey of scrapPercentageEntityTypeKeys) {
    const currentEntityTypeId = getCurrentHashSystemEntityTypeId({
      entityTypeKey,
      migrationState,
    });

    const currentEntityType = await getEntityTypeById(
      context.graphApi,
      authentication,
      {
        entityTypeId: currentEntityTypeId,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    );

    if (!currentEntityType) {
      throw new Error(`Expected entity type ${currentEntityTypeId} to exist`);
    }

    const schema: EntityType = upgradeEntityTypeDependencies({
      schema: currentEntityType.schema,
      upgradedEntityTypeIds,
    });

    const { updatedEntityTypeId } = await updateSystemEntityType(
      context,
      authentication,
      {
        currentEntityTypeId,
        migrationState,
        newSchema: {
          ...schema,
          properties: replaceReferences(
            schema.properties,
            propertyTypeReplacements,
          ),
        },
      },
    );

    upgradedEntityTypeIds.push(updatedEntityTypeId);
  }
};
