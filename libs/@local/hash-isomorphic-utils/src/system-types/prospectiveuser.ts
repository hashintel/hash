/**
 * This file was automatically generated – do not edit it.
 */

import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type {
  EmailPropertyValue,
  TextDataType,
  WebsiteURLPropertyValue,
} from "./shared";

export type { EmailPropertyValue, TextDataType, WebsiteURLPropertyValue };

/**
 * The name or description of the current approach to something
 */
export type CurrentApproachPropertyValue = TextDataType;

/**
 * The name or description of someone's intended use of something
 */
export type IntendedUsePropertyValue = TextDataType;

export type ProspectiveUser = SimpleEntity<ProspectiveUserProperties>;

export type ProspectiveUserOutgoingLinkAndTarget = never;

export type ProspectiveUserOutgoingLinksByLinkEntityTypeId = {};

/**
 * The
 */
export type ProspectiveUserProperties = {
  "https://hash.ai/@hash/types/property-type/current-approach/": CurrentApproachPropertyValue;
  "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValue;
  "https://hash.ai/@hash/types/property-type/intended-use/": IntendedUsePropertyValue;
  "https://hash.ai/@hash/types/property-type/role/": RolePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/": WebsiteURLPropertyValue;
  "https://hash.ai/@hash/types/property-type/willing-to-pay/": WillingToPayPropertyValue;
};

/**
 * The name of someone or something's role.
 */
export type RolePropertyValue = TextDataType;

/**
 * The amount that someone is willing to pay for something
 */
export type WillingToPayPropertyValue = TextDataType;
