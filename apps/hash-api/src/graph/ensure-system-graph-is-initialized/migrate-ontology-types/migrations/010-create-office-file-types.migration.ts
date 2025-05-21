import type { MigrationFunction } from "../types";
import {
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
        titlePlural: "Document Files",
        icon: "/icons/types/file-lines.svg",
        description: "A document file.",
        properties: [
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
            required: false,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _pdfFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [documentFileEntityType.schema.$id],
        title: "PDF Document",
        titlePlural: "PDF Documents",
        icon: "/icons/types/file-pdf.svg",
        description: "A PDF document.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _docxFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [documentFileEntityType.schema.$id],
        title: "DOCX Document",
        titlePlural: "DOCX Documents",
        icon: "/icons/types/file-word.svg",
        description: "A Microsoft Word document.",
      },
      webShortname: "h",
      migrationState,
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
        titlePlural: "Presentation Files",
        icon: "/icons/types/presentation-screen.svg",
        description: "A presentation file.",
        properties: [
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
            required: false,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _pptxFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [slideshowFileEntityType.schema.$id],
        title: "PPTX Presentation",
        titlePlural: "PPTX Presentations",
        icon: "/icons/types/file-powerpoint.svg",
        description: "A Microsoft PowerPoint presentation.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  return migrationState;
};

export default migrate;
