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
  RelatesToMaterial,
  RelatesToMaterialOutgoingLinkAndTarget,
  RelatesToMaterialOutgoingLinksByLinkEntityTypeId,
  RelatesToMaterialProperties,
  RelatesToMaterialPropertiesWithMetadata,
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
  RelatesToMaterial,
  RelatesToMaterialOutgoingLinkAndTarget,
  RelatesToMaterialOutgoingLinksByLinkEntityTypeId,
  RelatesToMaterialProperties,
  RelatesToMaterialPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  WeightUnitOfMeasurePropertyValue,
  WeightUnitOfMeasurePropertyValueWithMetadata,
};

/**
 * Language code identifying the language of the description
 */
export type LanguageKeyPropertyValue = TextDataType;

export type LanguageKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Description of a material or product
 */
export type MaterialDescription = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/material-description/v/1",
  ];
  properties: MaterialDescriptionProperties;
  propertiesWithMetadata: MaterialDescriptionPropertiesWithMetadata;
};

export type MaterialDescriptionOutgoingLinkAndTarget =
  MaterialDescriptionRelatesToMaterialLink;

export type MaterialDescriptionOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@sap/types/entity-type/relates-to-material/v/1": MaterialDescriptionRelatesToMaterialLink;
};

/**
 * Description of a material or product
 */
export type MaterialDescriptionProperties = {
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/language-key/"?: LanguageKeyPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-description/"?: MaterialDescriptionPropertyValue;
};

export type MaterialDescriptionPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/language-key/"?: LanguageKeyPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-description/"?: MaterialDescriptionPropertyValueWithMetadata;
  };
};

/**
 * Short text description of the material in the specified language
 */
export type MaterialDescriptionPropertyValue = TextDataType;

export type MaterialDescriptionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type MaterialDescriptionRelatesToMaterialLink = {
  linkEntity: RelatesToMaterial;
  rightEntity: MaterialMasterData;
};
