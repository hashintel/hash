/**
 * This file was automatically generated – do not edit it.
 */

import type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DurationDataType,
  DurationDataTypeWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type { ArrayMetadata, ObjectMetadata } from "@blockprotocol/type-system";

export type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DurationDataType,
  DurationDataTypeWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * Whether items with too few samples should be excluded from analysis or view.
 */
export type ExcludeLowSamplesPropertyValue = BooleanDataType;

export type ExcludeLowSamplesPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether outlying observations should be excluded from analysis or view.
 */
export type ExcludeOutliersPropertyValue = BooleanDataType;

export type ExcludeOutliersPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * An item which has been read by someone or something.
 */
export type ReadItemPropertyValue = TextDataType;

export type ReadItemPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * User-scoped preferences for supply-chain views in a HASH web.
 */
export type SupplyChainUserPreferences = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/supply-chain-user-preferences/v/1",
  ];
  properties: SupplyChainUserPreferencesProperties;
  propertiesWithMetadata: SupplyChainUserPreferencesPropertiesWithMetadata;
};

export type SupplyChainUserPreferencesOutgoingLinkAndTarget = never;

export type SupplyChainUserPreferencesOutgoingLinksByLinkEntityTypeId = {};

/**
 * User-scoped preferences for supply-chain views in a HASH web.
 */
export type SupplyChainUserPreferencesProperties = {
  "https://hash.ai/@h/types/property-type/exclude-low-samples/"?: ExcludeLowSamplesPropertyValue;
  "https://hash.ai/@h/types/property-type/exclude-outliers/"?: ExcludeOutliersPropertyValue;
  "https://hash.ai/@h/types/property-type/read-item/"?: ReadItemPropertyValue[];
  "https://hash.ai/@h/types/property-type/time-period/"?: TimePeriodPropertyValue;
};

export type SupplyChainUserPreferencesPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/exclude-low-samples/"?: ExcludeLowSamplesPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/exclude-outliers/"?: ExcludeOutliersPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/read-item/"?: {
      value: ReadItemPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/time-period/"?: TimePeriodPropertyValueWithMetadata;
  };
};

/**
 * A period of elapsed time.
 */
export type TimePeriodPropertyValue = DurationDataType;

export type TimePeriodPropertyValueWithMetadata = DurationDataTypeWithMetadata;
