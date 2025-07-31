/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

/**
 * Base unit of measure in which this item is recorded
 */
export type BaseUoMPropertyValue = TextDataType;

export type BaseUoMPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type BooleanDataTypeWithMetadata = {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
};
export type BooleanDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
};

/**
 * Town or city part of the customer's address
 */
export type CityPropertyValue = TextDataType;

export type CityPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Identifies the SAP client (tenant/environment)
 */
export type ClientPropertyValue = TextDataType;

export type ClientPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * ISO country code for the customer's address
 */
export type CountryKeyPropertyValue = TextDataType;

export type CountryKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Time when the record was created
 */
export type CreatedAtPropertyValue = TimeDataType;

export type CreatedAtPropertyValueWithMetadata = TimeDataTypeWithMetadata;

/**
 * Username of the person who created the record
 */
export type CreatedByPropertyValue = TextDataType;

export type CreatedByPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Date when the record was created (typically used for master records, such as material master data)
 */
export type CreatedOnMasterRecordPropertyValue = DateDataType;

export type CreatedOnMasterRecordPropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * Date when the record was created
 */
export type CreatedOnRecordPropertyValue = DateDataType;

export type CreatedOnRecordPropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * Unique identifier for a customer within a client
 */
export type CustomerNumberPropertyValue = TextDataType;

export type CustomerNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A reference to a particular day represented within a calendar system, formatted according to RFC 3339.
 */
export type DateDataType = TextDataType;

export type DateDataTypeWithMetadata = {
  value: DateDataType;
  metadata: DateDataTypeMetadata;
};
export type DateDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1";
};

/**
 * Flag indicating whether the material is marked for deletion
 */
export type DeletionFlagPropertyValue = BooleanDataType;

export type DeletionFlagPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * Date when the delivery is scheduled to be completed
 */
export type DeliveryDatePropertyValue = DateDataType;

export type DeliveryDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * Unique identifier for a sales document
 */
export type DeliveryNumberPropertyValue = TextDataType;

export type DeliveryNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Code representing the type of delivery
 */
export type DeliveryTypePropertyValue = TextDataType;

export type DeliveryTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Gross weight of the material including packaging
 */
export type GrossWeightPropertyValue = NumberDataType;

export type GrossWeightPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Code denoting the customer's industry classification
 */
export type IndustryKeyPropertyValue = TextDataType;

export type IndustryKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).
 */
export type IntegerDataType = NumberDataType;

export type IntegerDataTypeWithMetadata = {
  value: IntegerDataType;
  metadata: IntegerDataTypeMetadata;
};
export type IntegerDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1";
};

/**
 * Used to classify items for pricing or sales variant logic
 */
export type ItemCategoryGroupPropertyValue = TextDataType;

export type ItemCategoryGroupPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * undefined
 */
export type Link = {
  entityTypeIds: [
    "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
  ];
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
};

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

export type LinkPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * General data on a customer, shared across sales areas
 */
export type MasterCustomerData = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/master-customer-data/v/1",
  ];
  properties: MasterCustomerDataProperties;
  propertiesWithMetadata: MasterCustomerDataPropertiesWithMetadata;
};

export type MasterCustomerDataOutgoingLinkAndTarget = never;

export type MasterCustomerDataOutgoingLinksByLinkEntityTypeId = {};

/**
 * General data on a customer, shared across sales areas
 */
export type MasterCustomerDataProperties = {
  "https://hash.ai/@sap/types/property-type/city/"?: CityPropertyValue;
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/country-key/"?: CountryKeyPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-on-record/"?: CreatedOnRecordPropertyValue;
  "https://hash.ai/@sap/types/property-type/customer-number/"?: CustomerNumberPropertyValue;
  "https://hash.ai/@sap/types/property-type/industry-key/"?: IndustryKeyPropertyValue;
  "https://hash.ai/@sap/types/property-type/name/"?: NamePropertyValue;
  "https://hash.ai/@sap/types/property-type/postal-code/"?: PostalCodePropertyValue;
  "https://hash.ai/@sap/types/property-type/region/"?: RegionPropertyValue;
  "https://hash.ai/@sap/types/property-type/street-and-house-number/"?: StreetAndHouseNumberPropertyValue;
};

export type MasterCustomerDataPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/city/"?: CityPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/country-key/"?: CountryKeyPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-on-record/"?: CreatedOnRecordPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/customer-number/"?: CustomerNumberPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/industry-key/"?: IndustryKeyPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/name/"?: NamePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/postal-code/"?: PostalCodePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/region/"?: RegionPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/street-and-house-number/"?: StreetAndHouseNumberPropertyValueWithMetadata;
  };
};

/**
 * Classification grouping of material for reporting or pricing
 */
export type MaterialGroupPropertyValue = TextDataType;

export type MaterialGroupPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Master data for a material
 */
export type MaterialMasterData = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/material-master-data/v/1",
  ];
  properties: MaterialMasterDataProperties;
  propertiesWithMetadata: MaterialMasterDataPropertiesWithMetadata;
};

export type MaterialMasterDataOutgoingLinkAndTarget = never;

export type MaterialMasterDataOutgoingLinksByLinkEntityTypeId = {};

/**
 * Master data for a material
 */
export type MaterialMasterDataProperties = {
  "https://hash.ai/@sap/types/property-type/base-uom/"?: BaseUoMPropertyValue;
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-on-master-record/"?: CreatedOnMasterRecordPropertyValue;
  "https://hash.ai/@sap/types/property-type/deletion-flag/"?: DeletionFlagPropertyValue;
  "https://hash.ai/@sap/types/property-type/gross-weight/"?: GrossWeightPropertyValue;
  "https://hash.ai/@sap/types/property-type/item-category-group/"?: ItemCategoryGroupPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-group/"?: MaterialGroupPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-number/"?: MaterialNumberPropertyValue;
  "https://hash.ai/@sap/types/property-type/material-type/"?: MaterialTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/net-weight/"?: NetWeightPropertyValue;
  "https://hash.ai/@sap/types/property-type/weight-unit-of-measure/"?: WeightUnitOfMeasurePropertyValue;
};

export type MaterialMasterDataPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/base-uom/"?: BaseUoMPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-on-master-record/"?: CreatedOnMasterRecordPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/deletion-flag/"?: DeletionFlagPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/gross-weight/"?: GrossWeightPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/item-category-group/"?: ItemCategoryGroupPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-group/"?: MaterialGroupPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-number/"?: MaterialNumberPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/material-type/"?: MaterialTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/net-weight/"?: NetWeightPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/weight-unit-of-measure/"?: WeightUnitOfMeasurePropertyValueWithMetadata;
  };
};

/**
 * Unique identifier for the material master record
 */
export type MaterialNumberPropertyValue = TextDataType;

export type MaterialNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Type of material or product
 */
export type MaterialTypePropertyValue = TextDataType;

export type MaterialTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Primary business or individual name
 */
export type NamePropertyValue = TextDataType;

export type NamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Net weight of the material without packaging
 */
export type NetWeightPropertyValue = NumberDataType;

export type NetWeightPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export type NumberDataTypeWithMetadata = {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
};
export type NumberDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
};

/**
 * Plant from which material is issued
 */
export type PlantPropertyValue = TextDataType;

export type PlantPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * ZIP or postal code of the customer's address
 */
export type PostalCodePropertyValue = TextDataType;

export type PostalCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Region or state part of the customer's address
 */
export type RegionPropertyValue = TextDataType;

export type RegionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Something that a customer is related to
 */
export type RelatesToCustomer = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/relates-to-customer/v/1",
  ];
  properties: RelatesToCustomerProperties;
  propertiesWithMetadata: RelatesToCustomerPropertiesWithMetadata;
};

export type RelatesToCustomerOutgoingLinkAndTarget = never;

export type RelatesToCustomerOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that a customer is related to
 */
export type RelatesToCustomerProperties = LinkProperties & {};

export type RelatesToCustomerPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * Something that a material is related to
 */
export type RelatesToMaterial = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/relates-to-material/v/1",
  ];
  properties: RelatesToMaterialProperties;
  propertiesWithMetadata: RelatesToMaterialPropertiesWithMetadata;
};

export type RelatesToMaterialOutgoingLinkAndTarget = never;

export type RelatesToMaterialOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that a material is related to
 */
export type RelatesToMaterialProperties = LinkProperties & {};

export type RelatesToMaterialPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * Key data for sales deliveries
 */
export type SalesDeliveryHeaderData = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/sales-delivery-header-data/v/1",
  ];
  properties: SalesDeliveryHeaderDataProperties;
  propertiesWithMetadata: SalesDeliveryHeaderDataPropertiesWithMetadata;
};

export type SalesDeliveryHeaderDataOutgoingLinkAndTarget =
  SalesDeliveryHeaderDataRelatesToCustomerLink;

export type SalesDeliveryHeaderDataOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@sap/types/entity-type/relates-to-customer/v/1": SalesDeliveryHeaderDataRelatesToCustomerLink;
};

/**
 * Key data for sales deliveries
 */
export type SalesDeliveryHeaderDataProperties = {
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-at/"?: CreatedAtPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValue;
  "https://hash.ai/@sap/types/property-type/created-on-record/"?: CreatedOnRecordPropertyValue;
  "https://hash.ai/@sap/types/property-type/delivery-date/"?: DeliveryDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/delivery-number/"?: DeliveryNumberPropertyValue;
  "https://hash.ai/@sap/types/property-type/delivery-type/"?: DeliveryTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/transaction-code/"?: TransactionCodePropertyValue;
};

export type SalesDeliveryHeaderDataPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-at/"?: CreatedAtPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-by/"?: CreatedByPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/created-on-record/"?: CreatedOnRecordPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/delivery-date/"?: DeliveryDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/delivery-number/"?: DeliveryNumberPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/delivery-type/"?: DeliveryTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/transaction-code/"?: TransactionCodePropertyValueWithMetadata;
  };
};

export type SalesDeliveryHeaderDataRelatesToCustomerLink = {
  linkEntity: RelatesToCustomer;
  rightEntity: MasterCustomerData;
};

/**
 * Specific warehouse/storage location at the plant
 */
export type StorageLocationPropertyValue = TextDataType;

export type StorageLocationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Street name and house/building number for the customer's address
 */
export type StreetAndHouseNumberPropertyValue = TextDataType;

export type StreetAndHouseNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

export type TextDataTypeWithMetadata = {
  value: TextDataType;
  metadata: TextDataTypeMetadata;
};
export type TextDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
};

/**
 * A reference to a particular clock time, formatted according to RFC 3339.
 */
export type TimeDataType = TextDataType;

export type TimeDataTypeWithMetadata = {
  value: TimeDataType;
  metadata: TimeDataTypeMetadata;
};
export type TimeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/time/v/1";
};

/**
 * The SAP transaction that was used to create the delivery (e.g. VL01N)
 */
export type TransactionCodePropertyValue = TextDataType;

export type TransactionCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Area (e.g. plant) where material valuation is maintained
 */
export type ValuationAreaPropertyValue = TextDataType;

export type ValuationAreaPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Unit of measure for the weight
 */
export type WeightUnitOfMeasurePropertyValue = TextDataType;

export type WeightUnitOfMeasurePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A year in the Gregorian calendar.
 */
export type YearDataType = IntegerDataType;

export type YearDataTypeWithMetadata = {
  value: YearDataType;
  metadata: YearDataTypeMetadata;
};
export type YearDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/year/v/1";
};
