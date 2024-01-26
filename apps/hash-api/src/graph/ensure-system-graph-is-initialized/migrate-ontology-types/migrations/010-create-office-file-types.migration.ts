import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Create the `Document File` entity type and its child entity types.
   */

  const currentFileEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "file",
    migrationState,
  });

  const documentFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [currentFileEntityTypeId],
        title: "Document File",
        description: "A document file.",
        properties: [
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
            required: false,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const _pdfFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [documentFileEntityType.schema.$id],
        title: "PDF Document",
        description: "A PDF document.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const _docxFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [documentFileEntityType.schema.$id],
        title: "DOCX Document",
        description: "A Microsoft Word document.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /**
   * Step 2. Create the `Presentation File` entity type and its child entity types.
   */

  const slideshowFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [currentFileEntityTypeId],
        title: "Presentation File",
        description: "A presentation file.",
        properties: [
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
            required: false,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const _pptxFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [slideshowFileEntityType.schema.$id],
        title: "PPTX Presentation",
        description: "A Microsoft PowerPoint presentation.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /**
   * Step 3. Create the `Spreadsheet File` entity type and its child entity types.
   */

  const spreadsheetFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [currentFileEntityTypeId],
        title: "Spreadsheet File",
        description: "A spreadsheet file.",
        /** @todo: add property definition */
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const _microsoftExcelFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [spreadsheetFileEntityType.schema.$id],
        title: "XLSX Spreadsheet",
        description: "A Microsoft Excel spreadsheet.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  return migrationState;
};

export default migrate;
