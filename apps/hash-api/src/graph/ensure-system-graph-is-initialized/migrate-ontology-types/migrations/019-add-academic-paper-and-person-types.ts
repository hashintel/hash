import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

import type { MigrationFunction } from "../types";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const doiDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "DOI",
        titlePlural: "DOI Links",
        description:
          "A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.",
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "hash",
    },
  );

  const doiPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "DOI",
        description: "The Digital Object Identifier (DOI) of an object",
        possibleValues: [{ dataTypeId: doiDataType.schema.$id }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const doiLinkPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "DOI Link",
        description:
          "A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it",
        possibleValues: [{ dataTypeId: systemDataTypes.uri.dataTypeId }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const summaryPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Summary",
        description: "An overview or synopsis of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const yearPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Year",
        description: "A year in the Gregorian calendar.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const methodologyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Methodology",
        description:
          "The procedure via which something was produced, analyzed, or otherwise approached.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const experimentalSubjectPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Experimental Subject",
        description:
          "The type of participant or observed entity in an experiment or study.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "hash",
    });

  const findingPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Finding",
        description:
          "The results or conclusion of an experiment, research project, investigation, etc.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const authorOfLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Author Of",
        titlePlural: "Author Ofs",
        inverse: {
          title: "Authored By",
        },
        description: "The author of something",
      },
      migrationState,
      instantiator: null,
      webShortname: "hash",
    },
  );

  const publishedInLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Published In",
        titlePlural: "Published Ins",
        inverse: {
          title: "Published",
        },
        description: "The place in which something was published",
      },
      migrationState,
      instantiator: null,
      webShortname: "hash",
    },
  );

  const affiliatedWith = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Affiliated With",
        titlePlural: "Affiliated Withs",
        inverse: {
          title: "Affiliated Width",
        },
        description: "Something that something is affiliated with.",
      },
      migrationState,
      instantiator: null,
      webShortname: "hash",
    },
  );

  const institutionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Institution",
        description:
          "An organization dedicated to a specific purpose, such as education, research, or public service, and structured with formal systems of governance and operation.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  const archiveEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Archive",
        description: "A collection of documents, records or other artifacts.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  const journalEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Journal",
        description:
          "A periodical publication containing articles and other content related to a particular subject or profession.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  const _universityEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [institutionEntityType.schema.$id],
        title: "University",
        description:
          "An institution of higher education and research, typically offering undergraduate and postgraduate degrees across a wide range of disciplines, and often engaging in the creation and dissemination of knowledge.",
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  const academicPaperEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Academic Paper",
        description: "A paper describing academic research",
        icon: "/memo.svg",
        labelProperty: systemPropertyTypes.title.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: systemPropertyTypes.title.propertyTypeId,
            required: true,
          },
          {
            propertyType: doiPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: doiLinkPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: summaryPropertyType.schema.$id,
            required: true,
          },
          {
            propertyType: yearPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: methodologyPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: experimentalSubjectPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: findingPropertyType.schema.$id,
            required: false,
          },
        ],
        outgoingLinks: [
          {
            destinationEntityTypes: [
              archiveEntityType.schema.$id,
              journalEntityType.schema.$id,
            ],
            linkEntityType: publishedInLinkEntityType.schema.$id,
          },
        ],
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  const _personEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Person",
        /** @todo improve this desc */
        description: "A human being",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            destinationEntityTypes: [institutionEntityType.schema.$id],
            linkEntityType: affiliatedWith.schema.$id,
          },
          {
            destinationEntityTypes: [academicPaperEntityType.schema.$id],
            linkEntityType: authorOfLinkEntityType.schema.$id,
          },
        ],
      },
      instantiator: null,
      migrationState,
      webShortname: "hash",
    },
  );

  return migrationState;
};

export default migrate;
