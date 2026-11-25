import {
  componentsFromVersionedUrl,
  extractBaseUrl,
  incrementOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { getPropertyTypeById } from "@local/hash-graph-sdk/property-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { logger } from "../../../../logger";
import { archiveDataType } from "../../../ontology/primitive/data-type";
import {
  getCurrentHashDataTypeId,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  updateSystemPropertyType,
} from "../util";
import { upgradeEntityTypeDependencies } from "../util/upgrade-entity-type-dependencies";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  systemDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * Abstract length groups from migration 000, which 034 replaced with `Length (Metric)` and `Length (Imperial)`.
 *
 * Archived types are left out of the generated `systemDataTypes`, so these are not looked up there.
 */
export const archivedLengthGroupBaseUrls = [
  "https://hash.ai/@h/types/data-type/metric-length-si/",
  "https://hash.ai/@h/types/data-type/imperial-length-uk/",
  "https://hash.ai/@h/types/data-type/imperial-length-us/",
] as BaseUrl[];

/**
 * Data types created before 034, which 034 gave new versions: units it moved into its unit groups, and `Duration`,
 * which 034 made the quantity of its time units.
 */
export const upgradedUnitKeys = [
  "meters",
  "centimeters",
  "millimeters",
  "kilometers",
  "inches",
  "feet",
  "yards",
  "miles",
  "kilograms",
  "grams",
  "metricTonnes",
  "pounds",
  "litres",
  "millilitres",
  "cubicMetres",
  "cubicFeet",
  "squareMetres",
  "squareCentimetres",
  "squareFeet",
  "hours",
  "days",
  "duration",
] as const satisfies (keyof typeof systemDataTypes)[];

/** Supply chain property types from 026 and 028 whose values include those data types. */
export const upgradedPropertyTypeKeys = [
  "grossWeight",
  "netWeight",
  "baseQuantity",
  "minimumLotSize",
  "fixedLotSize",
  "maximumLotSize",
  "roundingValue",
  "reorderPoint",
  "safetyStock",
  "deliveredQuantity",
  "scheduledQuantity",
  "orderQuantity",
  "componentQuantity",
  "requirementQuantity",
  "withdrawnQuantity",
  "goodsReceiptQuantity",
  "productionQuantity",
  "movementQuantity",
  "stockQuantity",
  "qualityInspectionStock",
  "restricted-useStock",
  "blockedStock",
  "valuatedStockQuantity",
  "timePeriod",
] as const satisfies (keyof typeof systemPropertyTypes)[];

type EntityTypeKey =
  | keyof typeof systemEntityTypes
  | keyof typeof systemLinkEntityTypes;

/**
 * The entity and link types that use those property types, and the types that refer to those, such as orders that link
 * to their items.
 *
 * A new version can only refer to types that exist, so each comes after every type it refers to.
 */
export const upgradedEntityTypeKeys = [
  "material",
  "purchaseOrderScheduleLine",
  "storedAt",
  "batch",
  "billOfMaterialsItem",
  "materialValuation",
  "productionOrderItem",
  "purchaseOrderItem",
  "salesOrderItem",
  "siteMaterialData",
  "billOfMaterials",
  "deliveryItem",
  "productionOrder",
  "purchaseOrder",
  "salesOrder",
  "delivery",
  "materialDocument",
  "materialReservation",
  "shipmentItem",
  "shipment",
  "supplyChainUserPreferences",
] as const satisfies EntityTypeKey[];

const isLinkEntityTypeKey = (
  key: EntityTypeKey,
): key is keyof typeof systemLinkEntityTypes => key in systemLinkEntityTypes;

const nextVersionOf = (typeId: VersionedUrl) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeId);
  return versionedUrlFromComponents(
    baseUrl,
    incrementOntologyTypeVersion(version),
  );
};

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
 * Archives the length groups that 034 left without children, and moves the supply chain property types from 026 and
 * 028 onto the versions of their units that 034 created, then the entity types that use them onto those property types.
 *
 * Existing entities keep their values: the v1 units they refer to are not archived.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Archive the childless length groups.
   *
   * A web administrator can archive its types, and a self-hosted instance holds system types as external types that no
   * web owns, so there they stay as they are.
   */
  if (!isSelfHostedInstance) {
    for (const dataTypeBaseUrl of archivedLengthGroupBaseUrls) {
      const dataTypeVersion = migrationState.dataTypeVersions[dataTypeBaseUrl];

      if (dataTypeVersion === undefined) {
        throw new Error(
          `Expected '${dataTypeBaseUrl}' data type to have been seeded`,
        );
      }

      const dataTypeId = versionedUrlFromComponents(
        dataTypeBaseUrl,
        dataTypeVersion,
      );

      const liveDataType = await getDataTypeById(
        context.graphApi,
        authentication,
        { dataTypeId, temporalAxes: currentTimeInstantTemporalAxes },
      );

      if (!liveDataType) {
        logger.debug(
          `Not archiving ${dataTypeId}, as it is already archived or does not exist`,
        );
        continue;
      }

      await archiveDataType(context, authentication, { dataTypeId });
    }
  }

  /**
   * Step 2: Move the property types onto the current versions of their units.
   */
  const unitReplacements = new Map<string, VersionedUrl>(
    upgradedUnitKeys.map((dataTypeKey) => {
      const dataTypeId = getCurrentHashDataTypeId({
        dataTypeKey,
        migrationState,
      });
      return [extractBaseUrl(dataTypeId), dataTypeId];
    }),
  );

  const propertyTypeReplacements = new Map<string, VersionedUrl>();

  for (const propertyTypeKey of upgradedPropertyTypeKeys) {
    const currentPropertyTypeId = getCurrentHashPropertyTypeId({
      propertyTypeKey,
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
      throw new Error(
        `Expected property type ${currentPropertyTypeId} to exist`,
      );
    }

    const { $id: _, ...schema }: PropertyType = currentPropertyType.schema;

    const { updatedPropertyTypeId } = await updateSystemPropertyType(
      context,
      authentication,
      {
        currentPropertyTypeId,
        migrationState,
        newSchema: {
          ...schema,
          oneOf: schema.oneOf.map((value) =>
            replaceReferences(value, unitReplacements),
          ),
        },
      },
    );

    propertyTypeReplacements.set(
      extractBaseUrl(updatedPropertyTypeId),
      updatedPropertyTypeId,
    );
  }

  /**
   * Step 3: Move the entity and link types that use them onto the new property types, and the types that refer to
   * those onto their new versions.
   *
   * `upgradeDependenciesInHashEntityType` refers each type to the next version of every other before any exists, which
   * the graph rejects for a link, so they are upgraded one at a time in an order where every reference already exists.
   */
  const currentEntityTypeIds = upgradedEntityTypeKeys.map((key) =>
    isLinkEntityTypeKey(key)
      ? getCurrentHashLinkEntityTypeId({
          linkEntityTypeKey: key,
          migrationState,
        })
      : getCurrentHashSystemEntityTypeId({
          entityTypeKey: key,
          migrationState,
        }),
  );

  const nextEntityTypeIds = currentEntityTypeIds.map(nextVersionOf);

  for (const currentEntityTypeId of currentEntityTypeIds) {
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
      upgradedEntityTypeIds: nextEntityTypeIds,
    });

    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId,
      migrationState,
      newSchema: {
        ...schema,
        properties: replaceReferences(
          schema.properties,
          propertyTypeReplacements,
        ),
      },
    });
  }

  return migrationState;
};

export default migrate;
