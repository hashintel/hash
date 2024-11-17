import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { Entity } from "@local/hash-graph-sdk/entity";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { File } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import PDFParser, { Output } from "pdf2json";

import { getEntityByFilter } from "../shared/get-entity-by-filter.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import type { FlowActionActivity } from "./types.js";
import { typedKeys } from "@local/advanced-types/typed-entries";
import { getLlmAnalysisOfDoc } from "./infer-metadata-from-document-action/get-llm-analysis-of-doc.js";

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

  const storageKey =
    documentEntity.properties[
      systemPropertyTypes.fileStorageKey.propertyTypeBaseUrl
    ];

  if (!storageKey) {
    return {
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} does not have a fileStorageKey property`,
    };
  }

  if (typeof storageKey !== "string") {
    return {
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} has a fileStorageKey property of type '${typeof storageKey}', expected 'string'`,
    };
  }

  await mkdir(baseFilePath, { recursive: true });

  const filePath = `${baseFilePath}/${generateUuid()}.pdf`;

  const s3Config = getAwsS3Config();

  const downloadProvider = new AwsS3StorageProvider(s3Config);

  const urlForDownload = await downloadProvider.presignDownload({
    entity: documentEntity as Entity<File>,
    expiresInSeconds: 60 * 60,
    key: storageKey,
  });

  const fetchFileResponse = await fetch(urlForDownload);

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

  const documentMetadata = await getLlmAnalysisOfDoc(filePath);

  const { authors, publishedInYear, summary, title } = documentMetadata;

  const documentJson = await new Promise<Output>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError),
    );

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      resolve(pdfData);
    });

    pdfParser.loadPDF(filePath).catch((err) => reject(err));
  });

  await unlink(filePath);

  const page = documentJson.Pages[0]!;
  const lines: Record<number, string> = {};

  for (const textItem of page.Texts) {
    const y = textItem.y;

    const text = textItem.R[0] ? decodeURIComponent(textItem.R[0].T) : "";
    if (!text) {
      continue;
    }

    lines[y] ??= "";
    lines[y] += `${text} `;
  }

  console.log(lines);

  console.log(documentJson.Meta);

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
