import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type { DOCXDocumentProperties } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import isDocker from "is-docker";
import officeParser from "officeparser";

const fetchFileFromUrl = async (url: string): Promise<Buffer> => {
  const urlObject = new URL(url);

  let rewrittenUrl: string | undefined = undefined;

  if (["localhost", "127.0.0.1"].includes(urlObject.hostname) && isDocker()) {
    /**
     * When the file host is `localhost` or `127.0.0.1` (i.e. the file is
     * hosted in a locally running machine), and the activity is running in a
     * docker container, we need to replace the host in the download URL with
     * `host.docker.internal` so that the docker container accesses the correct
     * host.
     */
    const rewrittenUrlObject = new URL(url);
    rewrittenUrlObject.hostname = "host.docker.internal";
    rewrittenUrl = rewrittenUrlObject.toString();
  }

  const response = await fetch(rewrittenUrl ?? url);

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
      entityTypeIds: [fileEntity.metadata.entityTypeId],
      properties: updatedProperties,
      archived: fileEntity.metadata.archived,
      draft:
        extractDraftIdFromEntityId(fileEntity.metadata.recordId.entityId) !==
        undefined,
    });
  }
};
