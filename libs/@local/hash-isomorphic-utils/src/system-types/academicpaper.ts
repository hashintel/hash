/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

import type {
  AffiliatedWith,
  AffiliatedWithOutgoingLinkAndTarget,
  AffiliatedWithOutgoingLinksByLinkEntityTypeId,
  AffiliatedWithProperties,
  AffiliatedWithPropertiesWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  CalendarYearDataType,
  CalendarYearDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Doc,
  DocAuthoredByLink,
  DocOutgoingLinkAndTarget,
  DocOutgoingLinksByLinkEntityTypeId,
  DocProperties,
  DocPropertiesWithMetadata,
  DOIDataType,
  DOIDataTypeWithMetadata,
  DOILinkPropertyValue,
  DOILinkPropertyValueWithMetadata,
  DOIPropertyValue,
  DOIPropertyValueWithMetadata,
  EmailDataType,
  EmailDataTypeWithMetadata,
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
  MethodologyPropertyValue,
  MethodologyPropertyValueWithMetadata,
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
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
} from "./shared.js";

export type {
  AffiliatedWith,
  AffiliatedWithOutgoingLinkAndTarget,
  AffiliatedWithOutgoingLinksByLinkEntityTypeId,
  AffiliatedWithProperties,
  AffiliatedWithPropertiesWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  CalendarYearDataType,
  CalendarYearDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Doc,
  DocAuthoredByLink,
  DocOutgoingLinkAndTarget,
  DocOutgoingLinksByLinkEntityTypeId,
  DocProperties,
  DocPropertiesWithMetadata,
  DOIDataType,
  DOIDataTypeWithMetadata,
  DOILinkPropertyValue,
  DOILinkPropertyValueWithMetadata,
  DOIPropertyValue,
  DOIPropertyValueWithMetadata,
  EmailDataType,
  EmailDataTypeWithMetadata,
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
  MethodologyPropertyValue,
  MethodologyPropertyValueWithMetadata,
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
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
};

/**
 * A paper describing academic research
 */
export type AcademicPaper = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/academic-paper/v/1"];
  properties: AcademicPaperProperties;
  propertiesWithMetadata: AcademicPaperPropertiesWithMetadata;
};

export type AcademicPaperOutgoingLinkAndTarget = never;

export type AcademicPaperOutgoingLinksByLinkEntityTypeId = {};

/**
 * A paper describing academic research
 */
export type AcademicPaperProperties = DocProperties & {
  "https://hash.ai/@h/types/property-type/doi-link/"?: DOILinkPropertyValue;
  "https://hash.ai/@h/types/property-type/doi/"?: DOIPropertyValue;
  "https://hash.ai/@h/types/property-type/experimental-subject/"?: ExperimentalSubjectPropertyValue;
  "https://hash.ai/@h/types/property-type/finding/"?: FindingPropertyValue;
  "https://hash.ai/@h/types/property-type/methodology/"?: MethodologyPropertyValue;
  "https://hash.ai/@h/types/property-type/summary/": SummaryPropertyValue;
  "https://hash.ai/@h/types/property-type/title/": TitlePropertyValue;
};

export type AcademicPaperPropertiesWithMetadata = DocPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/doi-link/"?: DOILinkPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/doi/"?: DOIPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/experimental-subject/"?: ExperimentalSubjectPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/finding/"?: FindingPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/methodology/"?: MethodologyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/summary/": SummaryPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/title/": TitlePropertyValueWithMetadata;
  };
};

/**
 * The type of participant or observed entity in an experiment or study.
 */
export type ExperimentalSubjectPropertyValue = TextDataType;

export type ExperimentalSubjectPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The results or conclusion of an experiment, research project, investigation, etc.
 */
export type FindingPropertyValue = TextDataType;

export type FindingPropertyValueWithMetadata = TextDataTypeWithMetadata;
