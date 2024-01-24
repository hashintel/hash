import { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { DOCXDocumentProperties } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import { AccountId, Entity } from "@local/hash-subgraph/.";
import officeParser from "officeparser";

type TextParsingFunction = (fileBuffer: Buffer) => Promise<string>;

const officeParserTextParsingFunction: TextParsingFunction = async (
  fileBuffer,
) => {
  const text = await officeParser.parseOfficeAsync(fileBuffer);

  return text;
};

const fileEntityTypeToParsingFunction: Record<
  VersionedUrl,
  TextParsingFunction
> = {
  [systemEntityTypes.docxDocument.entityTypeId]:
    officeParserTextParsingFunction,
  [systemEntityTypes.pdfDocument.entityTypeId]: officeParserTextParsingFunction,
  [systemEntityTypes.pptxPresentation.entityTypeId]:
    officeParserTextParsingFunction,
};

export const parseTextFromFileActivity = async (
  context: { graphApiClient: GraphApi },
  params: {
    stringifiedFileBuffer: string;
    fileEntity: Entity;
    webMachineActorId: AccountId;
  },
) => {
  const { graphApiClient } = context;

  const { stringifiedFileBuffer, fileEntity, webMachineActorId } = params;

  const fileBuffer = Buffer.from(stringifiedFileBuffer, "base64");

  const textParsingFunction =
    fileEntityTypeToParsingFunction[fileEntity.metadata.entityTypeId];

  if (textParsingFunction) {
    const textualContent = await textParsingFunction(fileBuffer);

    /** @todo: refetch these to prevent potential data loss */
    const previousProperties = fileEntity.properties as DOCXDocumentProperties;

    const updatedProperties = {
      ...previousProperties,
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
        textualContent,
    } as DOCXDocumentProperties;

    await graphApiClient.updateEntity(webMachineActorId, {
      entityId: fileEntity.metadata.recordId.entityId,
      entityTypeId: fileEntity.metadata.entityTypeId,
      properties: updatedProperties,
      archived: fileEntity.metadata.archived,
      draft: fileEntity.metadata.draft,
    });
  }
};
