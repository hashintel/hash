import type {
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type { TextualContentPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/shared";
import officeParser from "officeparser";

import { fetchFileFromUrl } from "./shared/fetch-file-from-url.js";
import { getFlowContext } from "./shared/get-flow-context.js";

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
  const fileEntity = new HashEntity(params.fileEntity);

  const fileResponse = await fetchFileFromUrl(presignedFileDownloadUrl);

  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

  let textParsingFunction: TextParsingFunction | undefined;
  for (const entityTypeId of fileEntity.metadata.entityTypeIds) {
    textParsingFunction = fileEntityTypeToParsingFunction[entityTypeId];
  }

  if (textParsingFunction) {
    const textualContent = await textParsingFunction(fileBuffer);

    const { flowEntityId, stepId } = await getFlowContext();

    const provenance: ProvidedEntityEditionProvenance = {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowEntityId,
        stepIds: [stepId],
      } satisfies OriginProvenance,
    };

    await fileEntity.patch(
      graphApiClient,
      { actorId: webMachineActorId },
      {
        propertyPatches: [
          {
            op: "add",
            path: [
              blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl,
            ],
            property: {
              value: textualContent,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            } satisfies TextualContentPropertyValueWithMetadata,
          },
        ],
        provenance,
      },
    );
  }
};
