import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import { getAwsS3Config } from "@local/hash-backend-utils/aws-config";
import { AwsS3StorageProvider } from "@local/hash-backend-utils/file-storage/aws-s3-storage-provider";
import type {
  OriginProvenance,
  PropertyProvenance,
  SourceProvenance,
} from "@local/hash-graph-client";
import type {
  EnforcedEntityEditionProvenance,
  Entity,
} from "@local/hash-graph-sdk/entity";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  File,
  TitlePropertyValue,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import type { Output } from "pdf2json";
import PDFParser from "pdf2json";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity.js";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification.js";
import { getEntityByFilter } from "../shared/get-entity-by-filter.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { logProgress } from "../shared/log-progress.js";
import { generateDocumentPropertyPatches } from "./infer-metadata-from-document-action/generate-property-patches.js";
import { generateDocumentProposedEntitiesAndCreateClaims } from "./infer-metadata-from-document-action/generate-proposed-entities-and-claims.js";
import { getLlmAnalysisOfDoc } from "./infer-metadata-from-document-action/get-llm-analysis-of-doc.js";
import type { FlowActionActivity } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseFilePath = path.join(__dirname, "/var/tmp_files");

export const inferMetadataFromDocumentAction: FlowActionActivity = async ({
  inputs,
}) => {
  const {
    flowEntityId,
    stepId,
    userAuthentication: { actorId: userActorId },
    webId,
  } = await getFlowContext();

  const { documentEntityId } = getSimplifiedActionInputs({
    inputs,
    actionType: "inferMetadataFromDocument",
  });

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: { actorId: userActorId },
    graphApiClient,
    grantCreatePermissionForWeb: webId,
  });

  if (!aiAssistantAccountId) {
    return {
      code: StatusCode.FailedPrecondition,
      contents: [],
      message: `Could not get AI assistant account for web ${webId}`,
    };
  }

  const documentEntity = await getEntityByFilter({
    actorId: aiAssistantAccountId,
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

  const documentJson = await new Promise<Output>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError),
    );

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      resolve(pdfData);
    });

    // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    pdfParser.loadPDF(filePath).catch((err) => reject(err));
  });

  const numberOfPages = documentJson.Pages.length;

  /**
   * @todo H-3620: handle documents exceeding Vertex AI limit of 30MB
   */

  const documentMetadata = await getLlmAnalysisOfDoc({
    fileSystemPath: filePath,
    hashFileStorageKey: storageKey,
    entityId: documentEntityId,
    fileUrl,
  });

  await unlink(filePath);

  const {
    authors,
    documentMetadata: { entityTypeId, properties },
  } = documentMetadata;

  const entityTypeIds = new Set(documentEntity.metadata.entityTypeIds);
  entityTypeIds.add(entityTypeId);

  const sourceProvenance: SourceProvenance = {
    type: "document",
    authors: (authors ?? []).map((author) => author.name),
    entityId: documentEntityId,
    location: { uri: fileUrl },
  };

  const provenance: EnforcedEntityEditionProvenance = {
    actorType: "ai",
    origin: {
      type: "flow",
      id: flowEntityId,
      stepIds: [stepId],
    } satisfies OriginProvenance,
    sources: [sourceProvenance],
  };

  const propertyProvenance: PropertyProvenance = {
    sources: [sourceProvenance],
  };

  const propertyPatches = generateDocumentPropertyPatches({
    numberOfPages,
    properties,
    provenance: propertyProvenance,
  });

  const existingEntity = documentEntity.toJSON();

  const updatedEntity = await documentEntity.patch(
    graphApiClient,
    { actorId: aiAssistantAccountId },
    {
      entityTypeIds: [...entityTypeIds],
      propertyPatches,
      provenance,
    },
  );

  await createInferredEntityNotification({
    entity: updatedEntity,
    graphApiClient,
    operation: "update",
    notifiedUserAccountId: userActorId,
  });

  const persistedDocumentEntity: PersistedEntity = {
    entity: updatedEntity.toJSON(),
    existingEntity,
    operation: "update",
  };

  logProgress([
    {
      persistedEntity: persistedDocumentEntity,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "PersistedEntity",
    },
  ]);

  const title = updatedEntity.properties[
    systemPropertyTypes.title.propertyTypeBaseUrl
  ] as TitlePropertyValue;

  const proposedEntities =
    await generateDocumentProposedEntitiesAndCreateClaims({
      aiAssistantAccountId,
      documentEntityId,
      documentMetadata: { authors },
      documentTitle: title,
      provenance,
      propertyProvenance,
    });

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" satisfies OutputNameForAction<"inferMetadataFromDocument">,
            payload: {
              kind: "ProposedEntity",
              value: proposedEntities,
            },
          },
          {
            outputName:
              "updatedDocumentEntity" satisfies OutputNameForAction<"inferMetadataFromDocument">,
            payload: {
              kind: "PersistedEntity",
              value: persistedDocumentEntity,
            },
          },
        ],
      },
    ],
  };
};
