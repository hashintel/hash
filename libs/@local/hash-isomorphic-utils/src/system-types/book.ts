/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

import type {
  AffiliatedWith,
  AffiliatedWithOutgoingLinkAndTarget,
  AffiliatedWithOutgoingLinksByLinkEntityTypeId,
  AffiliatedWithProperties,
  AffiliatedWithPropertiesWithMetadata,
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  Company,
  CompanyOutgoingLinkAndTarget,
  CompanyOutgoingLinksByLinkEntityTypeId,
  CompanyProperties,
  CompanyPropertiesWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  Institution,
  InstitutionOutgoingLinkAndTarget,
  InstitutionOutgoingLinksByLinkEntityTypeId,
  InstitutionProperties,
  InstitutionPropertiesWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  NumberOfPagesPropertyValue,
  NumberOfPagesPropertyValueWithMetadata,
  Person,
  PersonAffiliatedWithLink,
  PersonOutgoingLinkAndTarget,
  PersonOutgoingLinksByLinkEntityTypeId,
  PersonProperties,
  PersonPropertiesWithMetadata,
  PersonWorkedAtLink,
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  RolePropertyValue,
  RolePropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  WorkedAt,
  WorkedAtOutgoingLinkAndTarget,
  WorkedAtOutgoingLinksByLinkEntityTypeId,
  WorkedAtProperties,
  WorkedAtPropertiesWithMetadata,
  WrittenWork,
  WrittenWorkAuthoredByLink,
  WrittenWorkOutgoingLinkAndTarget,
  WrittenWorkOutgoingLinksByLinkEntityTypeId,
  WrittenWorkProperties,
  WrittenWorkPropertiesWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
} from "./shared.js";

export type {
  AffiliatedWith,
  AffiliatedWithOutgoingLinkAndTarget,
  AffiliatedWithOutgoingLinksByLinkEntityTypeId,
  AffiliatedWithProperties,
  AffiliatedWithPropertiesWithMetadata,
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  Company,
  CompanyOutgoingLinkAndTarget,
  CompanyOutgoingLinksByLinkEntityTypeId,
  CompanyProperties,
  CompanyPropertiesWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  Institution,
  InstitutionOutgoingLinkAndTarget,
  InstitutionOutgoingLinksByLinkEntityTypeId,
  InstitutionProperties,
  InstitutionPropertiesWithMetadata,
  IntegerDataType,
  IntegerDataTypeWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  NumberOfPagesPropertyValue,
  NumberOfPagesPropertyValueWithMetadata,
  Person,
  PersonAffiliatedWithLink,
  PersonOutgoingLinkAndTarget,
  PersonOutgoingLinksByLinkEntityTypeId,
  PersonProperties,
  PersonPropertiesWithMetadata,
  PersonWorkedAtLink,
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  RolePropertyValue,
  RolePropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  WorkedAt,
  WorkedAtOutgoingLinkAndTarget,
  WorkedAtOutgoingLinksByLinkEntityTypeId,
  WorkedAtProperties,
  WorkedAtPropertiesWithMetadata,
  WrittenWork,
  WrittenWorkAuthoredByLink,
  WrittenWorkOutgoingLinkAndTarget,
  WrittenWorkOutgoingLinksByLinkEntityTypeId,
  WrittenWorkProperties,
  WrittenWorkPropertiesWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
};

/**
 * A written work, typically longer than an article, often published in print form.
 */
export type Book = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/book/v/1"];
  properties: BookProperties;
  propertiesWithMetadata: BookPropertiesWithMetadata;
};

export type BookOutgoingLinkAndTarget = never;

export type BookOutgoingLinksByLinkEntityTypeId = {};

/**
 * A written work, typically longer than an article, often published in print form.
 */
export type BookProperties = BookProperties1 & BookProperties2;
export type BookProperties1 = WrittenWorkProperties;

export type BookProperties2 = {
  "https://hash.ai/@hash/types/property-type/isbn/"?: ISBNPropertyValue;
};

export type BookPropertiesWithMetadata = BookPropertiesWithMetadata1 &
  BookPropertiesWithMetadata2;
export type BookPropertiesWithMetadata1 = WrittenWorkPropertiesWithMetadata;

export type BookPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/isbn/"?: ISBNPropertyValueWithMetadata;
  };
};

/**
 * International Standard Book Number: a numeric commercial book identifier that is intended to be unique, issued by an affiliate of the International ISBN Agency.
 */
export type ISBNDataType = ISBNDataType1;
export type ISBNDataType1 = TextDataType;

export type ISBNDataType2 = string;

export type ISBNDataTypeWithMetadata = {
  value: ISBNDataType;
  metadata: ISBNDataTypeMetadata;
};
export type ISBNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/isbn/v/1";
};

/**
 * The International Standard Book Number (ISBN) of a book
 */
export type ISBNPropertyValue = ISBNDataType;

export type ISBNPropertyValueWithMetadata = ISBNDataTypeWithMetadata;
