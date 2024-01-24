import { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import { DOCXDocumentProperties } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import officeParser from "officeparser";

/** @todo: turn this into an activity */
const fetchFileFromUrl = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
};

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

export const parseTextFromFile = async (
  context: { graphApiClient: GraphApi },
  params: ParseTextFromFileParams,
) => {
  const { graphApiClient } = context;

  const { presignedFileDownloadUrl, fileEntity, webMachineActorId } = params;

  const fileBuffer = await fetchFileFromUrl(presignedFileDownloadUrl);

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
