/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  EmailDataType,
  EmailDataTypeWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
} from "./shared.js";

export type {
  EmailDataType,
  EmailDataTypeWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
};

/**
 * The name or description of the current approach to something
 */
export type CurrentApproachPropertyValue = TextDataType;

export type CurrentApproachPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name or description of someone's intended use of something
 */
export type IntendedUsePropertyValue = TextDataType;

export type IntendedUsePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Information about a prospective user of an application or system
 */
export type ProspectiveUser = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/prospective-user/v/1"];
  properties: ProspectiveUserProperties;
  propertiesWithMetadata: ProspectiveUserPropertiesWithMetadata;
};

export type ProspectiveUserOutgoingLinkAndTarget = never;

export type ProspectiveUserOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about a prospective user of an application or system
 */
export type ProspectiveUserProperties = {
  "https://hash.ai/@h/types/property-type/current-approach/": CurrentApproachPropertyValue;
  "https://hash.ai/@h/types/property-type/email/": EmailPropertyValue;
  "https://hash.ai/@h/types/property-type/intended-use/": IntendedUsePropertyValue;
  "https://hash.ai/@h/types/property-type/role/": RolePropertyValue;
  "https://hash.ai/@h/types/property-type/website-url/": WebsiteURLPropertyValue;
  "https://hash.ai/@h/types/property-type/willing-to-pay/": WillingToPayPropertyValue;
};

export type ProspectiveUserPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/current-approach/": CurrentApproachPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/email/": EmailPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/intended-use/": IntendedUsePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/role/": RolePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/website-url/": WebsiteURLPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/willing-to-pay/": WillingToPayPropertyValueWithMetadata;
  };
};

/**
 * The name of someone or something's role.
 */
export type RolePropertyValue = TextDataType;

export type RolePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The amount that someone is willing to pay for something
 */
export type WillingToPayPropertyValue = TextDataType;

export type WillingToPayPropertyValueWithMetadata = TextDataTypeWithMetadata;
