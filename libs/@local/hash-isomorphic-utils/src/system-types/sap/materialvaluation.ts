/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

import type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ClientPropertyValue,
  ClientPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimeDataType,
  TimeDataTypeWithMetadata,
  ValuationAreaPropertyValue,
  ValuationAreaPropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
} from "./shared.js";

export type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ClientPropertyValue,
  ClientPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DeletionFlagPropertyValue,
  DeletionFlagPropertyValueWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimeDataType,
  TimeDataTypeWithMetadata,
  ValuationAreaPropertyValue,
  ValuationAreaPropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
};

/**
 * Fiscal year for the current valuation data
 */
export type FiscalYearPropertyValue = YearDataType;

export type FiscalYearPropertyValueWithMetadata = YearDataTypeWithMetadata;

/**
 * Effective date when the future price will apply
 */
export type FuturePriceDatePropertyValue = DateDataType;

export type FuturePriceDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * Validated future price due to future-dated settings
 */
export type FuturePriceValuePropertyValue = NumberDataType;

export type FuturePriceValuePropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Date when the price (e.g. standard) was last updated
 */
export type LastPriceChangeDatePropertyValue = DateDataType;

export type LastPriceChangeDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * Valuation data for materials including prices, stock values, and accounting information
 */
export type MaterialValuation = {
  entityTypeIds: [
    "https://hash.ai/@sap/types/entity-type/material-valuation/v/1",
  ];
  properties: MaterialValuationProperties;
  propertiesWithMetadata: MaterialValuationPropertiesWithMetadata;
};

export type MaterialValuationOutgoingLinkAndTarget = never;

export type MaterialValuationOutgoingLinksByLinkEntityTypeId = {};

/**
 * Valuation data for materials including prices, stock values, and accounting information
 */
export type MaterialValuationProperties = {
  "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValue;
  "https://hash.ai/@sap/types/property-type/deletion-flag/"?: DeletionFlagPropertyValue;
  "https://hash.ai/@sap/types/property-type/fiscal-year/"?: FiscalYearPropertyValue;
  "https://hash.ai/@sap/types/property-type/future-price-date/"?: FuturePriceDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/future-price-value/"?: FuturePriceValuePropertyValue;
  "https://hash.ai/@sap/types/property-type/last-price-change-date/"?: LastPriceChangeDatePropertyValue;
  "https://hash.ai/@sap/types/property-type/moving-avg-price/"?: MovingAvgPricePropertyValue;
  "https://hash.ai/@sap/types/property-type/posting-period/"?: PostingPeriodPropertyValue;
  "https://hash.ai/@sap/types/property-type/price-control-flag/"?: PriceControlFlagPropertyValue;
  "https://hash.ai/@sap/types/property-type/price-unit/"?: PriceUnitPropertyValue;
  "https://hash.ai/@sap/types/property-type/prior-period-stock-qty/"?: PriorPeriodStockQtyPropertyValue;
  "https://hash.ai/@sap/types/property-type/prior-period-stock-value/"?: PriorPeriodStockValuePropertyValue;
  "https://hash.ai/@sap/types/property-type/standard-price/"?: StandardPricePropertyValue;
  "https://hash.ai/@sap/types/property-type/stock-qty-beginning/"?: StockQtyBeginningPropertyValue;
  "https://hash.ai/@sap/types/property-type/stock-value-beginning/"?: StockValueBeginningPropertyValue;
  "https://hash.ai/@sap/types/property-type/utc-timestamp-short/"?: UTCTimestampShortPropertyValue;
  "https://hash.ai/@sap/types/property-type/valuation-area/"?: ValuationAreaPropertyValue;
  "https://hash.ai/@sap/types/property-type/valuation-category/"?: ValuationCategoryPropertyValue;
  "https://hash.ai/@sap/types/property-type/valuation-class/"?: ValuationClassPropertyValue;
  "https://hash.ai/@sap/types/property-type/valuation-type/"?: ValuationTypePropertyValue;
  "https://hash.ai/@sap/types/property-type/value-std-price/"?: ValueStdPricePropertyValue;
};

export type MaterialValuationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@sap/types/property-type/client/"?: ClientPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/deletion-flag/"?: DeletionFlagPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/fiscal-year/"?: FiscalYearPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/future-price-date/"?: FuturePriceDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/future-price-value/"?: FuturePriceValuePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/last-price-change-date/"?: LastPriceChangeDatePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/moving-avg-price/"?: MovingAvgPricePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/posting-period/"?: PostingPeriodPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/price-control-flag/"?: PriceControlFlagPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/price-unit/"?: PriceUnitPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/prior-period-stock-qty/"?: PriorPeriodStockQtyPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/prior-period-stock-value/"?: PriorPeriodStockValuePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/standard-price/"?: StandardPricePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/stock-qty-beginning/"?: StockQtyBeginningPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/stock-value-beginning/"?: StockValueBeginningPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/utc-timestamp-short/"?: UTCTimestampShortPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/valuation-area/"?: ValuationAreaPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/valuation-category/"?: ValuationCategoryPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/valuation-class/"?: ValuationClassPropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/valuation-type/"?: ValuationTypePropertyValueWithMetadata;
    "https://hash.ai/@sap/types/property-type/value-std-price/"?: ValueStdPricePropertyValueWithMetadata;
  };
};

/**
 * Current moving-average per-unit price
 */
export type MovingAvgPricePropertyValue = NumberDataType;

export type MovingAvgPricePropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Accounting period within the fiscal year
 */
export type PostingPeriodPropertyValue = NumberDataType;

export type PostingPeriodPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Indicates price method used (Standard or Moving Average)
 */
export type PriceControlFlagPropertyValue = TextDataType;

export type PriceControlFlagPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Number of units the prices refer to (e.g. per 1, per 100)
 */
export type PriceUnitPropertyValue = NumberDataType;

export type PriceUnitPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Stock quantity in previous period
 */
export type PriorPeriodStockQtyPropertyValue = NumberDataType;

export type PriorPeriodStockQtyPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Stock value in previous period
 */
export type PriorPeriodStockValuePropertyValue = NumberDataType;

export type PriorPeriodStockValuePropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Fixed standard price set for the material
 */
export type StandardPricePropertyValue = NumberDataType;

export type StandardPricePropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Total valuated stock quantity before posting
 */
export type StockQtyBeginningPropertyValue = NumberDataType;

export type StockQtyBeginningPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Total value of valuated stock before posting
 */
export type StockValueBeginningPropertyValue = NumberDataType;

export type StockValueBeginningPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * UTC equivalent of last update timestamp
 */
export type UTCTimestampShortPropertyValue = TimeDataType;

export type UTCTimestampShortPropertyValueWithMetadata =
  TimeDataTypeWithMetadata;

/**
 * Indicates split valuation category type
 */
export type ValuationCategoryPropertyValue = TextDataType;

export type ValuationCategoryPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Classification linking to GL accounts
 */
export type ValuationClassPropertyValue = TextDataType;

export type ValuationClassPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Type/class of valuation, such as legal vs. group valuation
 */
export type ValuationTypePropertyValue = TextDataType;

export type ValuationTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Value based on standard price (only if standard priced)
 */
export type ValueStdPricePropertyValue = NumberDataType;

export type ValueStdPricePropertyValueWithMetadata = NumberDataTypeWithMetadata;
