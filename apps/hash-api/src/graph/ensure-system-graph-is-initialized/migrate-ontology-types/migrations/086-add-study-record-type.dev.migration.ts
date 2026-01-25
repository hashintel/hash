import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /** Data types */
  const phaseDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Trial Phase",
        description:
          "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const nctIdDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "NCT ID",
        description:
          "National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.",
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  /** Property types */

  const objectivePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Objective",
        description: "The goal or aim of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const trialPhasePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Trial Phase",
        description:
          "The stage of a clinical trial studying a drug or biological product.",
        possibleValues: [{ dataTypeId: phaseDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const integerDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "integer",
    migrationState,
  });

  const actualEnrollmentPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Actual Enrollment",
        description: "The actual number of participants enrolled in something.",
        possibleValues: [{ dataTypeId: integerDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const dateDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "date",
    migrationState,
  });

  const actualStudyStartDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Actual Study Start Date",
        description:
          "The actual date on which the first participant was enrolled in a clinical study.",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const actualPrimaryCompletionDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Actual Study Primary Completion Date",
        description:
          "The date on which the last participant in a study was examined or received an intervention to collect final data for the primary outcome measure.",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const actualStudyCompletionDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Actual Study Completion Date",
        description:
          "The date on which the last participant in a clinical study was examined or received an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const estimatedEnrollmentPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Estimated Enrollment",
        description:
          "The estimated number of participants that will be enrolled in something.",
        possibleValues: [{ dataTypeId: integerDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const estimatedStudyStartDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Estimated Study Start Date",
        description:
          "The estimated date on which the first participant will be enrolled in a clinical study.",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const estimatedPrimaryCompletionDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Estimated Primary Completion Date",
        description:
          "The estimated date on which the last participant in a study will be examined or receive an intervention to collect final data for the primary outcome measure.",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const estimatedStudyCompletionDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Estimated Study Completion Date",
        description:
          "The estimated date on which the last participant in a clinical study will be examined or receive an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const nctIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "NCT ID",
        description:
          "The National Clinical Trial (NCT) Identifier Number for a study registered with ClinicalTrials.gov",
        possibleValues: [{ dataTypeId: nctIdDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const isrctnIdDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "ISRCTN",
        description:
          "The unique id for a study registered with the ISRCTN Registry.",
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const isrctnIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "ISRCTN",
        description: "The ISRCTN Registry identifier for something.",
        possibleValues: [{ dataTypeId: isrctnIdDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const studyTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Study Type",
        description:
          "Describes the nature of a clinical study. Study types include interventional studies, which aim to find out more about a particular intervention by assigning people to different treatment groups, and observational studies, where the researchers do not influence what treatment the participants receive.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const medicalConditionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Medical Condition",
        description:
          "A disease, disorder, syndrome, illness, or injury, which may relate to either or both of physical and mental health.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const timeFramePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Time Frame",
        description:
          "The time period over which something occurs or is measured.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const outcomeMeasurePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Outcome Measure",
        description: "A measurement used to evaluate the outcome of a trial",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
                $ref: blockProtocolPropertyTypes.name.propertyTypeId,
              },
              [blockProtocolPropertyTypes.description.propertyTypeBaseUrl]: {
                $ref: blockProtocolPropertyTypes.description.propertyTypeId,
              },
              [timeFramePropertyType.metadata.recordId.baseUrl]: {
                $ref: timeFramePropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const interventionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Intervention",
        description:
          "An action taken to change something, typically to address a problem or otherwise bring about a desirable outcome.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const studyArmPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Study Arm",
        description:
          "A specific treatment group in a clinical trial. Each arm represents a unique intervention strategy or control group, allowing researchers to compare outcomes between different approaches.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
                $ref: blockProtocolPropertyTypes.name.propertyTypeId,
              },
              [interventionPropertyType.metadata.recordId.baseUrl]: {
                $ref: interventionPropertyType.schema.$id,
              },
              [systemPropertyTypes.methodology.propertyTypeBaseUrl]: {
                $ref: getCurrentHashPropertyTypeId({
                  propertyTypeKey: "methodology",
                  migrationState,
                }),
              },
            },
            propertyTypeObjectRequiredProperties: [
              blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const inclusionCriteriaPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Inclusion Criteria",
        description:
          "Criteria that must be met for someone or something to be included in something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const exclusionCriteriaPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Exclusion Criteria",
        description:
          "Criteria that would prevent someone or something from being included in something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const statusPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Status",
        description: "The status of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const contactLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Contact",
        description: "A contact for something (an organization, project, etc.)",
      },
      migrationState,
      webShortname: "h",
    },
  );

  const sponsoredByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Sponsored By",
        description:
          "An organization, person or other entity that provides financial, material, or other support for something, e.g. a project, study, or event.",
        inverse: {
          title: "Sponsors",
        },
      },
      migrationState,
      webShortname: "h",
    },
  );

  const investigatedByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Investigated By",
        titlePlural: "Investigated By",
        description:
          "A person, organization, or other entity that conducted research, analysis, or examination of something.",
        inverse: {
          title: "Investigator Of",
        },
      },
      migrationState,
      webShortname: "h",
    },
  );

  const personEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "person",
    migrationState,
  });

  const institutionEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "institution",
    migrationState,
  });

  const docEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "doc",
    migrationState,
  });

  const _clinicalTrialRecordEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [docEntityTypeId],
        title: "Study Record",
        titlePlural: "Study Records",
        description:
          "A record of a study, including intervention studies (clinical trials), observational studies, and others.",
        icon: "/icons/types/microscope.svg",
        properties: [
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "methodology",
              migrationState,
            }),
            required: true,
          },
          {
            propertyType: objectivePropertyType.schema.$id,
            required: true,
            array: true,
          },
          {
            propertyType: statusPropertyType.schema.$id,
          },
          {
            propertyType: nctIdPropertyType.schema.$id,
          },
          {
            propertyType: isrctnIdPropertyType.schema.$id,
          },
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "doi",
              migrationState,
            }),
          },
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "doiLink",
              migrationState,
            }),
          },
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "location",
              migrationState,
            }),
          },
          {
            propertyType: trialPhasePropertyType.schema.$id,
          },
          {
            propertyType: studyTypePropertyType.schema.$id,
          },
          {
            propertyType: medicalConditionPropertyType.schema.$id,
            array: true,
          },
          {
            propertyType: actualEnrollmentPropertyType.schema.$id,
          },
          {
            propertyType: actualStudyStartDatePropertyType.schema.$id,
          },
          {
            propertyType: actualPrimaryCompletionDatePropertyType.schema.$id,
          },
          {
            propertyType: actualStudyCompletionDatePropertyType.schema.$id,
          },
          {
            propertyType: estimatedEnrollmentPropertyType.schema.$id,
          },
          {
            propertyType: estimatedStudyStartDatePropertyType.schema.$id,
          },
          {
            propertyType: estimatedPrimaryCompletionDatePropertyType.schema.$id,
          },
          {
            propertyType: estimatedStudyCompletionDatePropertyType.schema.$id,
          },
          {
            propertyType: outcomeMeasurePropertyType.schema.$id,
            array: true,
          },
          {
            propertyType: studyArmPropertyType.schema.$id,
            array: true,
          },
          {
            propertyType: inclusionCriteriaPropertyType.schema.$id,
            array: true,
          },
          {
            propertyType: exclusionCriteriaPropertyType.schema.$id,
            array: true,
          },
        ],
        outgoingLinks: [
          {
            destinationEntityTypes: [
              personEntityTypeId,
              institutionEntityTypeId,
            ],
            linkEntityType: sponsoredByLinkEntityType.schema.$id,
          },
          {
            destinationEntityTypes: [personEntityTypeId],
            linkEntityType: investigatedByLinkEntityType.schema.$id,
          },
          {
            destinationEntityTypes: [personEntityTypeId],
            linkEntityType: contactLinkEntityType.schema.$id,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    });

  return migrationState;
};

export default migrate;
