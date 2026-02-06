/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ArrayMetadata,
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

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
  DateDataType,
  DateDataTypeWithMetadata,
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
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
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
  DateDataType,
  DateDataTypeWithMetadata,
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
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
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
 * The actual number of participants enrolled in something.
 */
export type ActualEnrollmentPropertyValue = IntegerDataType;

export type ActualEnrollmentPropertyValueWithMetadata =
  IntegerDataTypeWithMetadata;

/**
 * The date on which the last participant in a clinical study was examined or received an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).
 */
export type ActualStudyCompletionDatePropertyValue = DateDataType;

export type ActualStudyCompletionDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The date on which the last participant in a study was examined or received an intervention to collect final data for the primary outcome measure.
 */
export type ActualStudyPrimaryCompletionDatePropertyValue = DateDataType;

export type ActualStudyPrimaryCompletionDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The actual date on which the first participant was enrolled in a clinical study.
 */
export type ActualStudyStartDatePropertyValue = DateDataType;

export type ActualStudyStartDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The estimated number of participants that will be enrolled in something.
 */
export type EstimatedEnrollmentPropertyValue = IntegerDataType;

export type EstimatedEnrollmentPropertyValueWithMetadata =
  IntegerDataTypeWithMetadata;

/**
 * The estimated date on which the last participant in a study will be examined or receive an intervention to collect final data for the primary outcome measure.
 */
export type EstimatedPrimaryCompletionDatePropertyValue = DateDataType;

export type EstimatedPrimaryCompletionDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The estimated date on which the last participant in a clinical study will be examined or receive an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).
 */
export type EstimatedStudyCompletionDatePropertyValue = DateDataType;

export type EstimatedStudyCompletionDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The estimated date on which the first participant will be enrolled in a clinical study.
 */
export type EstimatedStudyStartDatePropertyValue = DateDataType;

export type EstimatedStudyStartDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * Criteria that would prevent someone or something from being included in something.
 */
export type ExclusionCriteriaPropertyValue = TextDataType;

export type ExclusionCriteriaPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A contact for something (an organization, project, etc.)
 */
export type HasContact = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-contact/v/1"];
  properties: HasContactProperties;
  propertiesWithMetadata: HasContactPropertiesWithMetadata;
};

export type HasContactOutgoingLinkAndTarget = never;

export type HasContactOutgoingLinksByLinkEntityTypeId = {};

/**
 * A contact for something (an organization, project, etc.)
 */
export type HasContactProperties = LinkProperties & {};

export type HasContactPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The unique id for a study registered with the ISRCTN Registry.
 */
export type ISRCTNDataType = TextDataType;

export type ISRCTNDataTypeWithMetadata = {
  value: ISRCTNDataType;
  metadata: ISRCTNDataTypeMetadata;
};
export type ISRCTNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/isrctn/v/1";
};

/**
 * The ISRCTN Registry identifier for something.
 */
export type ISRCTNPropertyValue = ISRCTNDataType;

export type ISRCTNPropertyValueWithMetadata = ISRCTNDataTypeWithMetadata;

/**
 * Criteria that must be met for someone or something to be included in something.
 */
export type InclusionCriteriaPropertyValue = TextDataType;

export type InclusionCriteriaPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An action taken to change something, typically to address a problem or otherwise bring about a desirable outcome.
 */
export type InterventionPropertyValue = TextDataType;

export type InterventionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A person, organization, or other entity that conducted research, analysis, or examination of something.
 */
export type InvestigatedBy = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/investigated-by/v/1"];
  properties: InvestigatedByProperties;
  propertiesWithMetadata: InvestigatedByPropertiesWithMetadata;
};

export type InvestigatedByOutgoingLinkAndTarget = never;

export type InvestigatedByOutgoingLinksByLinkEntityTypeId = {};

/**
 * A person, organization, or other entity that conducted research, analysis, or examination of something.
 */
export type InvestigatedByProperties = LinkProperties & {};

export type InvestigatedByPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * A disease, disorder, syndrome, illness, or injury, which may relate to either or both of physical and mental health.
 */
export type MedicalConditionPropertyValue = TextDataType;

export type MedicalConditionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.
 */
export type NCTIDDataType = TextDataType;

export type NCTIDDataTypeWithMetadata = {
  value: NCTIDDataType;
  metadata: NCTIDDataTypeMetadata;
};
export type NCTIDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/nct-id/v/1";
};

/**
 * The National Clinical Trial (NCT) Identifier Number for a study registered with ClinicalTrials.gov
 */
export type NCTIDPropertyValue = NCTIDDataType;

export type NCTIDPropertyValueWithMetadata = NCTIDDataTypeWithMetadata;

/**
 * The goal or aim of something.
 */
export type ObjectivePropertyValue = TextDataType;

export type ObjectivePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A measurement used to evaluate the outcome of a trial
 */
export type OutcomeMeasurePropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/time-frame/"?: TimeFramePropertyValue;
};

export type OutcomeMeasurePropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/time-frame/"?: TimeFramePropertyValueWithMetadata;
  };
};

/**
 * An organization, person or other entity that provides financial, material, or other support for something, e.g. a project, study, or event.
 */
export type SponsoredBy = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/sponsored-by/v/1"];
  properties: SponsoredByProperties;
  propertiesWithMetadata: SponsoredByPropertiesWithMetadata;
};

export type SponsoredByOutgoingLinkAndTarget = never;

export type SponsoredByOutgoingLinksByLinkEntityTypeId = {};

/**
 * An organization, person or other entity that provides financial, material, or other support for something, e.g. a project, study, or event.
 */
export type SponsoredByProperties = LinkProperties & {};

export type SponsoredByPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The status of something.
 */
export type StatusPropertyValue = TextDataType;

export type StatusPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A specific treatment group in a clinical trial. Each arm represents a unique intervention strategy or control group, allowing researchers to compare outcomes between different approaches.
 */
export type StudyArmPropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/intervention/"?: InterventionPropertyValue;
  "https://hash.ai/@h/types/property-type/methodology/"?: MethodologyPropertyValue;
};

export type StudyArmPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/intervention/"?: InterventionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/methodology/"?: MethodologyPropertyValueWithMetadata;
  };
};

/**
 * A record of a study, including intervention studies (clinical trials), observational studies, and others.
 */
export type StudyRecord = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/study-record/v/1"];
  properties: StudyRecordProperties;
  propertiesWithMetadata: StudyRecordPropertiesWithMetadata;
};

export type StudyRecordHasContactLink = {
  linkEntity: HasContact;
  rightEntity: Person;
};

export type StudyRecordInvestigatedByLink = {
  linkEntity: InvestigatedBy;
  rightEntity: Person;
};

export type StudyRecordOutgoingLinkAndTarget =
  | StudyRecordHasContactLink
  | StudyRecordInvestigatedByLink
  | StudyRecordSponsoredByLink;

export type StudyRecordOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-contact/v/1": StudyRecordHasContactLink;
  "https://hash.ai/@h/types/entity-type/investigated-by/v/1": StudyRecordInvestigatedByLink;
  "https://hash.ai/@h/types/entity-type/sponsored-by/v/1": StudyRecordSponsoredByLink;
};

/**
 * A record of a study, including intervention studies (clinical trials), observational studies, and others.
 */
export type StudyRecordProperties = DocProperties & {
  "https://hash.ai/@h/types/property-type/actual-enrollment/"?: ActualEnrollmentPropertyValue;
  "https://hash.ai/@h/types/property-type/actual-study-completion-date/"?: ActualStudyCompletionDatePropertyValue;
  "https://hash.ai/@h/types/property-type/actual-study-primary-completion-date/"?: ActualStudyPrimaryCompletionDatePropertyValue;
  "https://hash.ai/@h/types/property-type/actual-study-start-date/"?: ActualStudyStartDatePropertyValue;
  "https://hash.ai/@h/types/property-type/doi-link/"?: DOILinkPropertyValue;
  "https://hash.ai/@h/types/property-type/doi/"?: DOIPropertyValue;
  "https://hash.ai/@h/types/property-type/estimated-enrollment/"?: EstimatedEnrollmentPropertyValue;
  "https://hash.ai/@h/types/property-type/estimated-primary-completion-date/"?: EstimatedPrimaryCompletionDatePropertyValue;
  "https://hash.ai/@h/types/property-type/estimated-study-completion-date/"?: EstimatedStudyCompletionDatePropertyValue;
  "https://hash.ai/@h/types/property-type/estimated-study-start-date/"?: EstimatedStudyStartDatePropertyValue;
  "https://hash.ai/@h/types/property-type/exclusion-criteria/"?: ExclusionCriteriaPropertyValue[];
  "https://hash.ai/@h/types/property-type/inclusion-criteria/"?: InclusionCriteriaPropertyValue[];
  "https://hash.ai/@h/types/property-type/isrctn/"?: ISRCTNPropertyValue;
  "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValue;
  "https://hash.ai/@h/types/property-type/medical-condition/"?: MedicalConditionPropertyValue[];
  "https://hash.ai/@h/types/property-type/methodology/": MethodologyPropertyValue;
  "https://hash.ai/@h/types/property-type/nct-id/"?: NCTIDPropertyValue;
  "https://hash.ai/@h/types/property-type/objective/": ObjectivePropertyValue[];
  "https://hash.ai/@h/types/property-type/outcome-measure/"?: OutcomeMeasurePropertyValue[];
  "https://hash.ai/@h/types/property-type/status/"?: StatusPropertyValue;
  "https://hash.ai/@h/types/property-type/study-arm/"?: StudyArmPropertyValue[];
  "https://hash.ai/@h/types/property-type/study-type/"?: StudyTypePropertyValue;
  "https://hash.ai/@h/types/property-type/trial-phase/"?: TrialPhasePropertyValue;
};

export type StudyRecordPropertiesWithMetadata = DocPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/actual-enrollment/"?: ActualEnrollmentPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/actual-study-completion-date/"?: ActualStudyCompletionDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/actual-study-primary-completion-date/"?: ActualStudyPrimaryCompletionDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/actual-study-start-date/"?: ActualStudyStartDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/doi-link/"?: DOILinkPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/doi/"?: DOIPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/estimated-enrollment/"?: EstimatedEnrollmentPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/estimated-primary-completion-date/"?: EstimatedPrimaryCompletionDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/estimated-study-completion-date/"?: EstimatedStudyCompletionDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/estimated-study-start-date/"?: EstimatedStudyStartDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/exclusion-criteria/"?: {
      value: ExclusionCriteriaPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/inclusion-criteria/"?: {
      value: InclusionCriteriaPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/isrctn/"?: ISRCTNPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/medical-condition/"?: {
      value: MedicalConditionPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/methodology/": MethodologyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/nct-id/"?: NCTIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/objective/": {
      value: ObjectivePropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/outcome-measure/"?: {
      value: OutcomeMeasurePropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/status/"?: StatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/study-arm/"?: {
      value: StudyArmPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/study-type/"?: StudyTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trial-phase/"?: TrialPhasePropertyValueWithMetadata;
  };
};

export type StudyRecordSponsoredByLink = {
  linkEntity: SponsoredBy;
  rightEntity: Person | Institution;
};

/**
 * Describes the nature of a clinical study. Study types include interventional studies, which aim to find out more about a particular intervention by assigning people to different treatment groups, and observational studies, where the researchers do not influence what treatment the participants receive.
 */
export type StudyTypePropertyValue = TextDataType;

export type StudyTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time period over which something occurs or is measured.
 */
export type TimeFramePropertyValue = TextDataType;

export type TimeFramePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.
 */
export type TrialPhaseDataType = TextDataType;

export type TrialPhaseDataTypeWithMetadata = {
  value: TrialPhaseDataType;
  metadata: TrialPhaseDataTypeMetadata;
};
export type TrialPhaseDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/trial-phase/v/1";
};

/**
 * The stage of a clinical trial studying a drug or biological product.
 */
export type TrialPhasePropertyValue = TrialPhaseDataType;

export type TrialPhasePropertyValueWithMetadata =
  TrialPhaseDataTypeWithMetadata;
