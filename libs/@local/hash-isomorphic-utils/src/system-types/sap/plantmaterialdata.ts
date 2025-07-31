/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

import type {
  BaseUoMPropertyValue,
  BaseUoMPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ClientPropertyValue,
  ClientPropertyValueWithMetadata,
  CreatedOnMasterRecordPropertyValue,
  CreatedOnMasterRecordPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  GrossWeightPropertyValue,
  GrossWeightPropertyValueWithMetadata,
  ItemCategoryGroupPropertyValue,
  ItemCategoryGroupPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  MaterialGroupPropertyValue,
  MaterialGroupPropertyValueWithMetadata,
  MaterialMasterData,
  MaterialMasterDataOutgoingLinkAndTarget,
  MaterialMasterDataOutgoingLinksByLinkEntityTypeId,
  MaterialMasterDataProperties,
  MaterialMasterDataPropertiesWithMetadata,
  MaterialNumberPropertyValue,
  MaterialNumberPropertyValueWithMetadata,
  MaterialTypePropertyValue,
  MaterialTypePropertyValueWithMetadata,
  NetWeightPropertyValue,
  NetWeightPropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  PlantPropertyValue,
  PlantPropertyValueWithMetadata,
  RelatesToMaterial,
  RelatesToMaterialOutgoingLinkAndTarget,
  RelatesToMaterialOutgoingLinksByLinkEntityTypeId,
  RelatesToMaterialProperties,
  RelatesToMaterialPropertiesWithMetadata,
  StorageLocationPropertyValue,
  StorageLocationPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  WeightUnitOfMeasurePropertyValue,
  WeightUnitOfMeasurePropertyValueWithMetadata,
} from "./shared.js";

export type {
  BaseUoMPropertyValue,
  BaseUoMPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ClientPropertyValue,
  ClientPropertyValueWithMetadata,
  CreatedOnMasterRecordPropertyValue,
  CreatedOnMasterRecordPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  GrossWeightPropertyValue,
  GrossWeightPropertyValueWithMetadata,
  ItemCategoryGroupPropertyValue,
  ItemCategoryGroupPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  MaterialGroupPropertyValue,
  MaterialGroupPropertyValueWithMetadata,
  MaterialMasterData,
  MaterialMasterDataOutgoingLinkAndTarget,
  MaterialMasterDataOutgoingLinksByLinkEntityTypeId,
  MaterialMasterDataProperties,
  MaterialMasterDataPropertiesWithMetadata,
  MaterialNumberPropertyValue,
  MaterialNumberPropertyValueWithMetadata,
  MaterialTypePropertyValue,
  MaterialTypePropertyValueWithMetadata,
  NetWeightPropertyValue,
  NetWeightPropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  PlantPropertyValue,
  PlantPropertyValueWithMetadata,
  RelatesToMaterial,
  RelatesToMaterialOutgoingLinkAndTarget,
  RelatesToMaterialOutgoingLinksByLinkEntityTypeId,
  RelatesToMaterialProperties,
  RelatesToMaterialPropertiesWithMetadata,
  StorageLocationPropertyValue,
  StorageLocationPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  WeightUnitOfMeasurePropertyValue,
  WeightUnitOfMeasurePropertyValueWithMetadata,
};

/**
 * Material Requirements Planning type (e.g. PD,VB, or ND)
 */
export type MRPTypePropertyValue = TextDataType;

export type MRPTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Status code indicating material status at the plant level
 */
export type MaintenanceStatusPropertyValue = TextDataType;

export type MaintenanceStatusPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Maximum lot size allowed for planning orders
 */
export type MaximumLotSizePropertyValue = NumberDataType;

export type MaximumLotSizePropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Standard procurement lead time in days
 */
export type PlannedDeliveryTimeDaysPropertyValue = NumberDataType;

export type PlannedDeliveryTimeDaysPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Plant-specific data for a material or product
 */
export type PlantMaterialData = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/plant-material-data/v/1",
  ];
  properties: PlantMaterialDataProperties;
  propertiesWithMetadata: PlantMaterialDataPropertiesWithMetadata;
};

export type PlantMaterialDataOutgoingLinkAndTarget =
  PlantMaterialDataRelatesToMaterialLink;

export type PlantMaterialDataOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@sap/types/entity-type/relates-to-material/v/1": PlantMaterialDataRelatesToMaterialLink;
};

/**
 * Plant-specific data for a material or product
 */
export type PlantMaterialDataProperties = {
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/maintenance-status/"?: MaintenanceStatusPropertyValue;
  "https://hash.ai/@sap/types/property-type/maximum-lot-size/"?: MaximumLotSizePropertyValue;
  "https://hash.ai/@sap/types/property-type/mrp-type/"?: MRPTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/planned-delivery-time-days/"?: PlannedDeliveryTimeDaysPropertyValue;
  "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValue;
  "https://hash.ai/@sap/types/property-type/safety-stock/"?: SafetyStockPropertyValue;
  "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValue;
};

export type PlantMaterialDataPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/maintenance-status/"?: MaintenanceStatusPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/maximum-lot-size/"?: MaximumLotSizePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/mrp-type/"?: MRPTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/planned-delivery-time-days/"?: PlannedDeliveryTimeDaysPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/safety-stock/"?: SafetyStockPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValueWithMetadata;
  };
};

export type PlantMaterialDataRelatesToMaterialLink = {
  linkEntity: RelatesToMaterial;
  rightEntity: MaterialMasterData;
};

/**
 * Safety stock level for the material (at plant level)
 */
export type SafetyStockPropertyValue = NumberDataType;

export type SafetyStockPropertyValueWithMetadata = NumberDataTypeWithMetadata;
