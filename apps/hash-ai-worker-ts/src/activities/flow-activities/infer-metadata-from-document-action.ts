import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import PDFParser from "pdf2json";

import { getEntityByFilter } from "../shared/get-entity-by-filter.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import type { FlowActionActivity } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseFilePath = join(__dirname, "/var/tmp_files");

export const inferMetadataFromDocumentAction: FlowActionActivity = async ({
  inputs,
}) => {
  const {
    flowEntityId,
    stepId,
    userAuthentication: { actorId },
    webId,
  } = await getFlowContext();

  const { documentEntityId } = getSimplifiedActionInputs({
    inputs,
    actionType: "inferMetadataFromDocument",
  });

  const webBotActorId = await getWebMachineActorId(
    { graphApi: graphApiClient },
    { actorId },
    { ownedById: webId },
  );

  const documentEntity = await getEntityByFilter({
    actorId: webBotActorId,
    includeDrafts: false,
    filter: {
      all: [
        {
          equal: [{ path: ["ownedById"] }, { parameter: webId }],
        },
        {
          equal: [
            { path: ["uuid"] },
            { parameter: extractEntityUuidFromEntityId(documentEntityId) },
          ],
        },
      ],
    },
    graphApiClient,
  });

  if (!documentEntity) {
    return {
      code: StatusCode.NotFound,
      contents: [],
      message: `Could not find or access document entity with entityId ${documentEntityId}`,
    };
  }

  const fileUrl =
    documentEntity.properties[
      blockProtocolPropertyTypes.fileUrl.propertyTypeBaseUrl
    ];

  if (!fileUrl) {
    return {
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} does not have a fileUrl property`,
    };
  }

  if (typeof fileUrl !== "string") {
    return {
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} has a fileUrl property of type '${typeof fileUrl}', expected 'string'`,
    };
  }

  await mkdir(baseFilePath, { recursive: true });

  const filePath = `${baseFilePath}/${generateUuid()}.pdf`;

  const fetchFileResponse = await fetch(fileUrl);

  if (!fetchFileResponse.ok || !fetchFileResponse.body) {
    return {
      code: StatusCode.NotFound,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} has a fileUrl ${fileUrl} that could not be fetched: ${fetchFileResponse.statusText}`,
    };
  }

  try {
    const fileStream = createWriteStream(filePath);
    await finished(
      Readable.fromWeb(
        fetchFileResponse.body as ReadableStream<Uint8Array>,
      ).pipe(fileStream),
    );
  } catch (error) {
    await unlink(filePath);
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Failed to write file to file system: ${(error as Error).message}`,
    };
  }

  const pdfParser = new PDFParser();

  const documentJson = await new Promise((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError),
    );

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      resolve(pdfData);
    });

    pdfParser.loadPDF(filePath).catch((err) => reject(err));
  });

  await unlink(filePath);

  console.log(documentJson);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" as OutputNameForAction<"inferMetadataFromDocument">,
            payload: {
              kind: "ProposedEntity",
              value: [],
            },
          },
        ],
      },
    ],
  };
};
