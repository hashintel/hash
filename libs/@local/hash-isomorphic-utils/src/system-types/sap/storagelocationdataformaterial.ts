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
 * Quantity currently blocked and not available for use
 */
export type BlockedStockPropertyValue = NumberDataType;

export type BlockedStockPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Quantity returned and blocked from use
 */
export type BlockedStockReturnsPropertyValue = NumberDataType;

export type BlockedStockReturnsPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Quantity currently in quality inspection
 */
export type StockInQualityInspectionPropertyValue = NumberDataType;

export type StockInQualityInspectionPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Quantity in transit between storage locations
 */
export type StockInTransferPropertyValue = NumberDataType;

export type StockInTransferPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Internal putaway bin identifier
 */
export type StorageBinPropertyValue = TextDataType;

export type StorageBinPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stock levels and storage information for materials at specific storage locations
 */
export type StorageLocationDataForMaterial = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/storage-location-data-for-material/v/1",
  ];
  properties: StorageLocationDataForMaterialProperties;
  propertiesWithMetadata: StorageLocationDataForMaterialPropertiesWithMetadata;
};

export type StorageLocationDataForMaterialOutgoingLinkAndTarget =
  StorageLocationDataForMaterialRelatesToMaterialLink;

export type StorageLocationDataForMaterialOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@sap/types/entity-type/relates-to-material/v/1": StorageLocationDataForMaterialRelatesToMaterialLink;
};

/**
 * Stock levels and storage information for materials at specific storage locations
 */
export type StorageLocationDataForMaterialProperties = {
  "https://hash.ai/@sap/types/property-type/blocked-stock-returns/"?: BlockedStockReturnsPropertyValue;
  "https://hash.ai/@sap/types/property-type/blocked-stock/"?: BlockedStockPropertyValue;
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValue;
  "https://hash.ai/@sap/types/property-type/stock-in-quality-inspection/"?: StockInQualityInspectionPropertyValue;
  "https://hash.ai/@sap/types/property-type/stock-in-transfer/"?: StockInTransferPropertyValue;
  "https://hash.ai/@sap/types/property-type/storage-bin/"?: StorageBinPropertyValue;
  "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValue;
  "https://hash.ai/@sap/types/property-type/unrestricted-use-stock/"?: UnrestrictedUseStockPropertyValue;
};

export type StorageLocationDataForMaterialPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/blocked-stock-returns/"?: BlockedStockReturnsPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/blocked-stock/"?: BlockedStockPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/stock-in-quality-inspection/"?: StockInQualityInspectionPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/stock-in-transfer/"?: StockInTransferPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/storage-bin/"?: StorageBinPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/unrestricted-use-stock/"?: UnrestrictedUseStockPropertyValueWithMetadata;
  };
};

export type StorageLocationDataForMaterialRelatesToMaterialLink = {
  linkEntity: RelatesToMaterial;
  rightEntity: MaterialMasterData;
};

/**
 * Quantity of valuated stock available without restrictions
 */
export type UnrestrictedUseStockPropertyValue = NumberDataType;

export type UnrestrictedUseStockPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;
