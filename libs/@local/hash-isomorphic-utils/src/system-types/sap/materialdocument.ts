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
  CreatedByPropertyValue,
  CreatedByPropertyValueWithMetadata,
  CreatedOnMasterRecordPropertyValue,
  CreatedOnMasterRecordPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  GrossWeightPropertyValue,
  GrossWeightPropertyValueWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
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
  TimeDataType,
  TimeDataTypeWithMetadata,
  TransactionCodePropertyValue,
  TransactionCodePropertyValueWithMetadata,
  ValuationAreaPropertyValue,
  ValuationAreaPropertyValueWithMetadata,
  WeightUnitOfMeasurePropertyValue,
  WeightUnitOfMeasurePropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
} from "./shared.js";

export type {
  BaseUoMPropertyValue,
  BaseUoMPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ClientPropertyValue,
  ClientPropertyValueWithMetadata,
  CreatedByPropertyValue,
  CreatedByPropertyValueWithMetadata,
  CreatedOnMasterRecordPropertyValue,
  CreatedOnMasterRecordPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  GrossWeightPropertyValue,
  GrossWeightPropertyValueWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
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
  TimeDataType,
  TimeDataTypeWithMetadata,
  TransactionCodePropertyValue,
  TransactionCodePropertyValueWithMetadata,
  ValuationAreaPropertyValue,
  ValuationAreaPropertyValueWithMetadata,
  WeightUnitOfMeasurePropertyValue,
  WeightUnitOfMeasurePropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
};

/**
 * Date shown on the document (often business/doc date)
 */
export type DocumentDatePropertyValue = DateDataType;

export type DocumentDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * Short header text/description associated with the document
 */
export type DocumentHeaderTextPropertyValue = TextDataType;

export type DocumentHeaderTextPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Code representing document category (e.g. goods receipt, goods issue)
 */
export type DocumentTypePropertyValue = TextDataType;

export type DocumentTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Date when the document was entered into the system
 */
export type EntryDatePropertyValue = DateDataType;

export type EntryDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * Time when the document was entered
 */
export type EntryTimePropertyValue = TimeDataType;

export type EntryTimePropertyValueWithMetadata = TimeDataTypeWithMetadata;

/**
 * Counter used to identify different header segments of the same record
 */
export type HeaderCounterPropertyValue = IntegerDataType;

export type HeaderCounterPropertyValueWithMetadata =
  IntegerDataTypeWithMetadata;

/**
 * Internal identifier for the document line
 */
export type InternalLineIDPropertyValue = NumberDataType;

export type InternalLineIDPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Line item number within the material document
 */
export type LineNumberPropertyValue = NumberDataType;

export type LineNumberPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Fiscal year in which the material document was posted
 */
export type MaterialDocFiscalYearPropertyValue = YearDataType;

export type MaterialDocFiscalYearPropertyValueWithMetadata =
  YearDataTypeWithMetadata;

/**
 * Unique number assigned to each material document
 */
export type MaterialDocNumberPropertyValue = TextDataType;

export type MaterialDocNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Records of material movements and transactions in the warehouse
 */
export type MaterialDocument = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/material-document/v/1",
  ];
  properties: MaterialDocumentProperties;
  propertiesWithMetadata: MaterialDocumentPropertiesWithMetadata;
};

export type MaterialDocumentOutgoingLinkAndTarget =
  MaterialDocumentRelatesToMaterialLink;

export type MaterialDocumentOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@sap/types/entity-type/relates-to-material/v/1": MaterialDocumentRelatesToMaterialLink;
};

/**
 * Records of material movements and transactions in the warehouse
 */
export type MaterialDocumentProperties = {
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValue;
  "https://hash.ai/@sap/types/property-type/document-date/"?: DocumentDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/document-header-text/"?: DocumentHeaderTextPropertyValue;
  "https://hash.ai/@sap/types/property-type/document-type/"?: DocumentTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/entry-date/"?: EntryDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/entry-time/"?: EntryTimePropertyValue;
  "https://hash.ai/@sap/types/property-type/header-counter/"?: HeaderCounterPropertyValue;
  "https://hash.ai/@sap/types/property-type/internal-line-id/"?: InternalLineIDPropertyValue;
  "https://hash.ai/@sap/types/property-type/line-number/"?: LineNumberPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-doc-fiscal-year/"?: MaterialDocFiscalYearPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-doc-number/"?: MaterialDocNumberPropertyValue;
  "https://hash.ai/@sap/types/property-type/movement-category/"?: MovementCategoryPropertyValue;
  "https://hash.ai/@sap/types/property-type/movement-type/"?: MovementTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValue;
  "https://hash.ai/@sap/types/property-type/posting-date/"?: PostingDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/reference-document/"?: ReferenceDocumentPropertyValue;
  "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValue;
  "https://hash.ai/@sap/types/property-type/transaction-code/"?: TransactionCodePropertyValue;
  "https://hash.ai/@sap/types/property-type/valuation-area/"?: ValuationAreaPropertyValue;
};

export type MaterialDocumentPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/document-date/"?: DocumentDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/document-header-text/"?: DocumentHeaderTextPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/document-type/"?: DocumentTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/entry-date/"?: EntryDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/entry-time/"?: EntryTimePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/header-counter/"?: HeaderCounterPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/internal-line-id/"?: InternalLineIDPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/line-number/"?: LineNumberPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-doc-fiscal-year/"?: MaterialDocFiscalYearPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-doc-number/"?: MaterialDocNumberPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/movement-category/"?: MovementCategoryPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/movement-type/"?: MovementTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/plant/"?: PlantPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/posting-date/"?: PostingDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/reference-document/"?: ReferenceDocumentPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/storage-location/"?: StorageLocationPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/transaction-code/"?: TransactionCodePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/valuation-area/"?: ValuationAreaPropertyValueWithMetadata;
  };
};

export type MaterialDocumentRelatesToMaterialLink = {
  linkEntity: RelatesToMaterial;
  rightEntity: MaterialMasterData;
};

/**
 * Movement category for valuation (e.g. 01=GR, 03=GI)
 */
export type MovementCategoryPropertyValue = TextDataType;

export type MovementCategoryPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Specific type of goods movement (e.g. 101, 261)
 */
export type MovementTypePropertyValue = TextDataType;

export type MovementTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Date when the movement was posted into the system
 */
export type PostingDatePropertyValue = DateDataType;

export type PostingDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * External reference number (e.g. PO/invoice)
 */
export type ReferenceDocumentPropertyValue = TextDataType;

export type ReferenceDocumentPropertyValueWithMetadata =
  TextDataTypeWithMetadata;
