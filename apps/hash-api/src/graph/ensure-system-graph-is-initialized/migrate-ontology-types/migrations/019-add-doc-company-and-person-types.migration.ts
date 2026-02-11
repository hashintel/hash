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
  getCurrentHashLinkEntityTypeId,
  getCurrentHashPropertyTypeId,
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
      webShortname: "h",
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
      webShortname: "h",
    },
  );

  const uriDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "uri",
    migrationState,
  });

  const doiLinkPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "DOI Link",
        description:
          "A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it",
        possibleValues: [{ dataTypeId: uriDataTypeId }],
      },
      migrationState,
      webShortname: "h",
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
      webShortname: "h",
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
      webShortname: "h",
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
      webShortname: "h",
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
      webShortname: "h",
    },
  );

  const calendarYearDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: integerDataType.schema.$id }],
        title: "Calendar Year",
        description: "A year in the Gregorian calendar.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const publicationYear = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Publication Year",
        description: "The year in which something was first published.",
        possibleValues: [{ dataTypeId: calendarYearDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
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
      webShortname: "h",
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
      webShortname: "h",
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
      webShortname: "h",
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
  //       inverse: {
  //         title: "Published",
  //       },
  //       description: "The entity that published something",
  //     },
  //     migrationState,
  //     webShortname: "h",
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
  //       inverse: {
  //         title: "Published",
  //       },
  //       description: "The place in which something was published",
  //     },
  //     migrationState,
  //     webShortname: "h",
  //   },
  // );

  const affiliatedWith = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Affiliated With",
        inverse: {
          title: "Affiliated With",
        },
        description: "Something that something is affiliated with.",
      },
      migrationState,
      webShortname: "h",
    },
  );

  const institutionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Institution",
        titlePlural: "Institutions",
        icon: "/icons/types/building-columns.svg",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
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
      migrationState,
      webShortname: "h",
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
  //     migrationState,
  //     webShortname: "h",
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
  //     migrationState,
  //     webShortname: "h",
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
  //     migrationState,
  //     webShortname: "h",
  //   },
  // );

  const personEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Person",
        /**
         * @todo when updating this, add plural title and set SVG icon
         */
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
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "email",
              migrationState,
            }),
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
      migrationState,
      webShortname: "h",
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
      webShortname: "h",
    },
  );

  const authoredByLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "authoredBy",
    migrationState,
  });

  const docEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Doc",
        description: "A written work, such as a book or article.",
        icon: "/types/icons/page-lines.svg",
        titlePlural: "Docs",
        labelProperty: systemPropertyTypes.title.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "title",
              migrationState,
            }),
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
            linkEntityType: authoredByLinkEntityTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _bookEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [docEntityType.schema.$id],
        title: "Book",
        titlePlural: "Books",
        icon: "/icons/types/book.svg",
        description:
          "A written work, typically longer than an article, often published in print form.",
        properties: [
          {
            propertyType: isbnPropertyType.schema.$id,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _academicPaperEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [docEntityType.schema.$id],
        title: "Academic Paper",
        titlePlural: "Academic Papers",
        icon: "/icons/types/memo.svg",
        description: "A paper describing academic research",
        properties: [
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "title",
              migrationState,
            }),
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
      migrationState,
      webShortname: "h",
    },
  );

  return migrationState;
};

export default migrate;
