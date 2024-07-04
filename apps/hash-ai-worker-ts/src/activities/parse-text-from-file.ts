import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi, OriginProvenance } from "@local/hash-graph-client";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import officeParser from "officeparser";

import { fetchFileFromUrl } from "./shared/fetch-file-from-url";
import { getFlowContext } from "./shared/get-flow-context";

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

    const { flowEntityId } = await getFlowContext();

    const provenance: EnforcedEntityEditionProvenance = {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowEntityId,
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
            value: textualContent,
          },
        ],
        provenance,
      },
    );
  }
};
