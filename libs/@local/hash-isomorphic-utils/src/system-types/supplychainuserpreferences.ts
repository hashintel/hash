/**
 * This file was automatically generated – do not edit it.
 */

import type {
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type { ArrayMetadata, ObjectMetadata } from "@blockprotocol/type-system";

export type {
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

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
  "https://hash.ai/@h/types/property-type/read-item/"?: ReadItemPropertyValue[];
};

export type SupplyChainUserPreferencesPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/read-item/"?: {
      value: ReadItemPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
  };
};
