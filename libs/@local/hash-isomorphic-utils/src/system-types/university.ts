/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Institution,
  InstitutionOutgoingLinkAndTarget,
  InstitutionOutgoingLinksByLinkEntityTypeId,
  InstitutionProperties,
  InstitutionPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Institution,
  InstitutionOutgoingLinkAndTarget,
  InstitutionOutgoingLinksByLinkEntityTypeId,
  InstitutionProperties,
  InstitutionPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * An institution of higher education and research, typically offering undergraduate and postgraduate degrees across a wide range of disciplines, and often engaging in the creation and dissemination of knowledge.
 */
export type University = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/university/v/1"];
  properties: UniversityProperties;
  propertiesWithMetadata: UniversityPropertiesWithMetadata;
};

export type UniversityOutgoingLinkAndTarget = never;

export type UniversityOutgoingLinksByLinkEntityTypeId = {};

/**
 * An institution of higher education and research, typically offering undergraduate and postgraduate degrees across a wide range of disciplines, and often engaging in the creation and dissemination of knowledge.
 */
export type UniversityProperties = UniversityProperties1 &
  UniversityProperties2;
export type UniversityProperties1 = InstitutionProperties;

export type UniversityProperties2 = {};

export type UniversityPropertiesWithMetadata =
  UniversityPropertiesWithMetadata1 & UniversityPropertiesWithMetadata2;
export type UniversityPropertiesWithMetadata1 =
  InstitutionPropertiesWithMetadata;

export type UniversityPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
