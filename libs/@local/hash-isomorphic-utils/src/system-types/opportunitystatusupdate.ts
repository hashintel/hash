/**
 * This file was automatically generated – do not edit it.
 */

import type {
  SiteCodePropertyValue,
  SiteCodePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

export type {
  SiteCodePropertyValue,
  SiteCodePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * The category of a status update left against an opportunity.
 */
export type OpportunityStatusCategoryDataType =
  | "Investigation started"
  | "Investigation update"
  | "Investigation concluded"
  | "Rejected (infeasible)"
  | "Rejected (data issue)";

export type OpportunityStatusCategoryDataTypeWithMetadata = {
  value: OpportunityStatusCategoryDataType;
  metadata: OpportunityStatusCategoryDataTypeMetadata;
};
export type OpportunityStatusCategoryDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/opportunity-status-category/v/1";
};

/**
 * The category assigned to a status report.
 */
export type OpportunityStatusPropertyValue = OpportunityStatusCategoryDataType;

export type OpportunityStatusPropertyValueWithMetadata =
  OpportunityStatusCategoryDataTypeWithMetadata;

/**
 * A status update for an opportunity for change or improvement.
 */
export type OpportunityStatusUpdate = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/opportunity-status-update/v/1",
  ];
  properties: OpportunityStatusUpdateProperties;
  propertiesWithMetadata: OpportunityStatusUpdatePropertiesWithMetadata;
};

export type OpportunityStatusUpdateOutgoingLinkAndTarget = never;

export type OpportunityStatusUpdateOutgoingLinksByLinkEntityTypeId = {};

/**
 * A status update for an opportunity for change or improvement.
 */
export type OpportunityStatusUpdateProperties = {
  "https://hash.ai/@h/types/property-type/opportunity-status/": OpportunityStatusPropertyValue;
  "https://hash.ai/@h/types/property-type/scope-key/": ScopeKeyPropertyValue;
  "https://hash.ai/@h/types/property-type/site-code/": SiteCodePropertyValue;
  "https://hash.ai/@h/types/property-type/status-update-text/"?: StatusUpdateTextPropertyValue;
};

export type OpportunityStatusUpdatePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/opportunity-status/": OpportunityStatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scope-key/": ScopeKeyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/site-code/": SiteCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/status-update-text/"?: StatusUpdateTextPropertyValueWithMetadata;
  };
};

/**
 * A stable key identifying something within a scope.
 */
export type ScopeKeyPropertyValue = TextDataType;

export type ScopeKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Text providing an update in the status of something.
 */
export type StatusUpdateTextPropertyValue = TextDataType;

export type StatusUpdateTextPropertyValueWithMetadata =
  TextDataTypeWithMetadata;
