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
  Archive,
  ArchiveOutgoingLinkAndTarget,
  ArchiveOutgoingLinksByLinkEntityTypeId,
  ArchiveProperties,
  ArchivePropertiesWithMetadata,
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
  Journal,
  JournalOutgoingLinkAndTarget,
  JournalOutgoingLinksByLinkEntityTypeId,
  JournalProperties,
  JournalPropertiesWithMetadata,
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
  Archive,
  ArchiveOutgoingLinkAndTarget,
  ArchiveOutgoingLinksByLinkEntityTypeId,
  ArchiveProperties,
  ArchivePropertiesWithMetadata,
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
  Journal,
  JournalOutgoingLinkAndTarget,
  JournalOutgoingLinksByLinkEntityTypeId,
  JournalProperties,
  JournalPropertiesWithMetadata,
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
 * A paper describing academic research
 */
export type AcademicPaper = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/academic-paper/v/1"];
  properties: AcademicPaperProperties;
  propertiesWithMetadata: AcademicPaperPropertiesWithMetadata;
};

export type AcademicPaperOutgoingLinkAndTarget = AcademicPaperPublishedInLink;

export type AcademicPaperOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/published-in/v/1": AcademicPaperPublishedInLink;
};

/**
 * A paper describing academic research
 */
export type AcademicPaperProperties = AcademicPaperProperties1 &
  AcademicPaperProperties2;
export type AcademicPaperProperties1 = WrittenWorkProperties;

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
export type AcademicPaperPropertiesWithMetadata1 =
  WrittenWorkPropertiesWithMetadata;

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

export type AcademicPaperPublishedInLink = {
  linkEntity: PublishedIn;
  rightEntity: Archive | Journal;
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
 * The place in which something was published
 */
export type PublishedIn = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/published-in/v/1"];
  properties: PublishedInProperties;
  propertiesWithMetadata: PublishedInPropertiesWithMetadata;
};

export type PublishedInOutgoingLinkAndTarget = never;

export type PublishedInOutgoingLinksByLinkEntityTypeId = {};

/**
 * The place in which something was published
 */
export type PublishedInProperties = PublishedInProperties1 &
  PublishedInProperties2;
export type PublishedInProperties1 = LinkProperties;

export type PublishedInProperties2 = {};

export type PublishedInPropertiesWithMetadata =
  PublishedInPropertiesWithMetadata1 & PublishedInPropertiesWithMetadata2;
export type PublishedInPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type PublishedInPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

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
