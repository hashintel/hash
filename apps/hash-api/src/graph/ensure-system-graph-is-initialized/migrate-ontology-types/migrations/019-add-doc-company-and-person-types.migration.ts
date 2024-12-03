import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
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
        titlePlural: "DOIs",
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

  const isbnDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "ISBN",
        titlePlural: "ISBNs",
        description:
          "International Standard Book Number: a numeric commercial book identifier that is intended to be unique, issued by an affiliate of the International ISBN Agency.",
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "hash",
    },
  );

  const isbnPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "ISBN",
        description: "The International Standard Book Number (ISBN) of a book",
        possibleValues: [{ dataTypeId: isbnDataType.schema.$id }],
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

  const integerDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        title: "Integer",
        description:
          "The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).",
        multipleOf: 1,
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "hash",
    },
  );

  const yearDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: integerDataType.schema.$id }],
        title: "Year",
        description: "A year in the Gregorian calendar.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "hash",
    },
  );

  const publicationYear = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Publication Year",
        description: "The year in which something was first published.",
        possibleValues: [{ dataTypeId: yearDataType.schema.$id }],
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

  const authoredByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        icon: "🖊",
        title: "Authored By",
        titlePlural: "Authored Bys",
        inverse: {
          title: "Author Of",
        },
        description: "Who or what something was authored by",
      },
      migrationState,
      instantiator: anyUserInstantiator,
      webShortname: "hash",
    },
  );

  /** @todo H-3619: Infer info on publisher and link to docs */
  // const _publishedByLinkEntityType = await createSystemEntityTypeIfNotExists(
  //   context,
  //   authentication,
  //   {
  //     entityTypeDefinition: {
  //       allOf: [linkEntityTypeUrl],
  //       title: "Published By",
  //       titlePlural: "Published Bys",
  //       inverse: {
  //         title: "Published",
  //       },
  //       description: "The entity that published something",
  //     },
  //     migrationState,
  //     instantiator: anyUserInstantiator,
  //     webShortname: "hash",
  //   },
  // );

  /** @todo H-3619: Infer info on publisher and link to docs */
  // const publishedInLinkEntityType = await createSystemEntityTypeIfNotExists(
  //   context,
  //   authentication,
  //   {
  //     entityTypeDefinition: {
  //       allOf: [linkEntityTypeUrl],
  //       title: "Published In",
  //       titlePlural: "Published Ins",
  //       inverse: {
  //         title: "Published",
  //       },
  //       description: "The place in which something was published",
  //     },
  //     migrationState,
  //     instantiator: anyUserInstantiator,
  //     webShortname: "hash",
  //   },
  // );

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
      instantiator: anyUserInstantiator,
      webShortname: "hash",
    },
  );

  const institutionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Institution",
        icon: "🏛",
        description:
          "An organization dedicated to a specific purpose, such as education, research, or public service, and structured with formal systems of governance and operation.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
        ],
      },
      instantiator: anyUserInstantiator,
      migrationState,
      webShortname: "hash",
    },
  );

  /** @todo H-3619: Infer info on publication venue and link to docs */
  // const archiveEntityType = await createSystemEntityTypeIfNotExists(
  //   context,
  //   authentication,
  //   {
  //     entityTypeDefinition: {
  //       title: "Archive",
  //       description: "A collection of documents, records or other artifacts.",
  //       properties: [
  //         {
  //           propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
  //           required: true,
  //         },
  //         {
  //           propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
  //         },
  //       ],
  //     },
  //     instantiator: anyUserInstantiator,
  //     migrationState,
  //     webShortname: "hash",
  //   },
  // );

  /** @todo H-3619: Infer info on publisher and link to docs */
  // const journalEntityType = await createSystemEntityTypeIfNotExists(
  //   context,
  //   authentication,
  //   {
  //     entityTypeDefinition: {
  //       title: "Journal",
  //       description:
  //         "A periodical publication containing articles and other content related to a particular subject or profession.",
  //       properties: [
  //         {
  //           propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
  //           required: true,
  //         },
  //         {
  //           propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
  //         },
  //       ],
  //     },
  //     instantiator: anyUserInstantiator,
  //     migrationState,
  //     webShortname: "hash",
  //   },
  // );

  /** @todo H-3619: Infer info on publisher and link to docs */
  // const _universityEntityType = await createSystemEntityTypeIfNotExists(
  //   context,
  //   authentication,
  //   {
  //     entityTypeDefinition: {
  //       allOf: [institutionEntityType.schema.$id],
  //       title: "University",
  //       description:
  //         "An institution of higher education and research, typically offering undergraduate and postgraduate degrees across a wide range of disciplines, and often engaging in the creation and dissemination of knowledge.",
  //     },
  //     instantiator: anyUserInstantiator,
  //     migrationState,
  //     webShortname: "hash",
  //   },
  // );

  const personEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Person",
        icon: "👤",
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
          },
          {
            propertyType: systemPropertyTypes.email.propertyTypeId,
            array: true,
          },
        ],
        outgoingLinks: [
          {
            destinationEntityTypes: [institutionEntityType.schema.$id],
            linkEntityType: affiliatedWith.schema.$id,
          },
        ],
      },
      instantiator: anyUserInstantiator,
      migrationState,
      webShortname: "hash",
    },
  );

  const numberOfPagesPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Number of Pages",
        description: "The total number of pages something has.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      migrationState,
      webShortname: "hash",
    },
  );

  const docEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Doc",
        description: "A written work, such as a book or article.",
        icon: "📝",
        labelProperty: systemPropertyTypes.title.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: systemPropertyTypes.title.propertyTypeId,
            required: true,
          },
          {
            propertyType: summaryPropertyType.schema.$id,
          },
          {
            propertyType: numberOfPagesPropertyType.schema.$id,
          },
          {
            propertyType: publicationYear.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            destinationEntityTypes: [personEntityType.schema.$id],
            linkEntityType: authoredByLinkEntityType.schema.$id,
          },
        ],
      },
      instantiator: anyUserInstantiator,
      migrationState,
      webShortname: "hash",
    },
  );

  const _bookEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [docEntityType.schema.$id],
        title: "Book",
        description:
          "A written work, typically longer than an article, often published in print form.",
        properties: [
          {
            propertyType: isbnPropertyType.schema.$id,
          },
        ],
      },
      instantiator: anyUserInstantiator,
      migrationState,
      webShortname: "hash",
    },
  );

  const _academicPaperEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [docEntityType.schema.$id],
        title: "Academic Paper",
        description: "A paper describing academic research",
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
          /** @todo H-3619: Infer info on publisher and link to docs */
          // {
          //   destinationEntityTypes: [
          //     archiveEntityType.schema.$id,
          //     journalEntityType.schema.$id,
          //   ],
          //   linkEntityType: publishedInLinkEntityType.schema.$id,
          // },
        ],
      },
      instantiator: anyUserInstantiator,
      migrationState,
      webShortname: "hash",
    },
  );

  return migrationState;
};

export default migrate;
