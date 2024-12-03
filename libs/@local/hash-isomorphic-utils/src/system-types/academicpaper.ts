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
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Doc,
  DocAuthoredByLink,
  DocOutgoingLinkAndTarget,
  DocOutgoingLinksByLinkEntityTypeId,
  DocProperties,
  DocPropertiesWithMetadata,
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
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
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
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  Doc,
  DocAuthoredByLink,
  DocOutgoingLinkAndTarget,
  DocOutgoingLinksByLinkEntityTypeId,
  DocProperties,
  DocPropertiesWithMetadata,
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
  PublicationYearPropertyValue,
  PublicationYearPropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  YearDataType,
  YearDataTypeWithMetadata,
};

/**
 * A paper describing academic research
 */
export type AcademicPaper = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/academic-paper/v/1"];
  properties: AcademicPaperProperties;
  propertiesWithMetadata: AcademicPaperPropertiesWithMetadata;
};

export type AcademicPaperOutgoingLinkAndTarget = never;

export type AcademicPaperOutgoingLinksByLinkEntityTypeId = {};

/**
 * A paper describing academic research
 */
export type AcademicPaperProperties = AcademicPaperProperties1 &
  AcademicPaperProperties2;
export type AcademicPaperProperties1 = DocProperties;

export type AcademicPaperProperties2 = {
  "https://hash.ai/@hash/types/property-type/doi-link/"?: DOILinkPropertyValue;
  "https://hash.ai/@hash/types/property-type/doi/"?: DOIPropertyValue;
  "https://hash.ai/@hash/types/property-type/experimental-subject/"?: ExperimentalSubjectPropertyValue;
  "https://hash.ai/@hash/types/property-type/finding/"?: FindingPropertyValue;
  "https://hash.ai/@hash/types/property-type/methodology/"?: MethodologyPropertyValue;
  "https://hash.ai/@hash/types/property-type/summary/": SummaryPropertyValue;
  "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValue;
};

export type AcademicPaperPropertiesWithMetadata =
  AcademicPaperPropertiesWithMetadata1 & AcademicPaperPropertiesWithMetadata2;
export type AcademicPaperPropertiesWithMetadata1 = DocPropertiesWithMetadata;

export type AcademicPaperPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/doi-link/"?: DOILinkPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/doi/"?: DOIPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/experimental-subject/"?: ExperimentalSubjectPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/finding/"?: FindingPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/methodology/"?: MethodologyPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/summary/": SummaryPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValueWithMetadata;
  };
};

/**
 * A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.
 */
export type DOIDataType = DOIDataType1;
export type DOIDataType1 = TextDataType;

export type DOIDataType2 = string;

export type DOIDataTypeWithMetadata = {
  value: DOIDataType;
  metadata: DOIDataTypeMetadata;
};
export type DOIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/doi/v/1";
};

/**
 * A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it
 */
export type DOILinkPropertyValue = URIDataType;

export type DOILinkPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The Digital Object Identifier (DOI) of an object
 */
export type DOIPropertyValue = DOIDataType;

export type DOIPropertyValueWithMetadata = DOIDataTypeWithMetadata;

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

/**
 * The procedure via which something was produced, analyzed, or otherwise approached.
 */
export type MethodologyPropertyValue = TextDataType;

export type MethodologyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A unique identifier for a resource (e.g. a URL, or URN).
 */
export type URIDataType = URIDataType1;
export type URIDataType1 = TextDataType;

export type URIDataType2 = string;

export type URIDataTypeWithMetadata = {
  value: URIDataType;
  metadata: URIDataTypeMetadata;
};
export type URIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/uri/v/1";
};
