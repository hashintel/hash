import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type { DOCXDocumentProperties } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import officeParser from "officeparser";

import { fetchFileFromUrl } from "./shared/fetch-file-from-url.js";

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

  const { presignedFileDownloadUrl, webMachineActorId } = params;
  const fileEntity = new Entity(params.fileEntity);

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

    await fileEntity.patch(
      graphApiClient,
      { actorId: webMachineActorId },
      {
        properties: [
          {
            op: "replace",
            path: [],
            value: updatedProperties,
          },
        ],
      },
    );
  }
};
