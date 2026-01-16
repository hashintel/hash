import type {
  OriginProvenance,
  PropertyProvenance,
  ProvidedEntityEditionProvenance,
  SourceProvenance,
  Url,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { PersistedEntityMetadata } from "@local/hash-isomorphic-utils/flows/types";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
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
import { useFileSystemPathFromEntity } from "../shared/use-file-system-file-from-url.js";
import { generateDocumentPropertyPatches } from "./infer-metadata-from-document-action/generate-property-patches.js";
import { generateDocumentProposedEntitiesAndCreateClaims } from "./infer-metadata-from-document-action/generate-proposed-entities-and-claims.js";
import { getLlmAnalysisOfDoc } from "./infer-metadata-from-document-action/get-llm-analysis-of-doc.js";

const isFileEntity = (entity: HashEntity): entity is HashEntity<File> =>
  systemPropertyTypes.fileStorageKey.propertyTypeBaseUrl in entity.properties &&
  blockProtocolPropertyTypes.fileUrl.propertyTypeBaseUrl in entity.properties;

export const inferMetadataFromDocumentAction: AiFlowActionActivity<
  "inferMetadataFromDocument"
> = async ({ inputs }) => {
  const {
    flowEntityId,
    stepId,
    userAuthentication: { actorId: userActorId },
    webId,
  } = await getFlowContext();

  const { documentEntityId } = getSimplifiedAiFlowActionInputs({
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
          equal: [{ path: ["webId"] }, { parameter: webId }],
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

  if (!isFileEntity(documentEntity)) {
    return {
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} is not a file entity`,
    };
  }

  const fileUrl = documentEntity.properties[
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
  ] as Url;

  if (!fileUrl) {
    return {
      code: StatusCode.NotFound,
      contents: [],
      message: `Document entity with entityId ${documentEntityId} does not have a fileUrl property`,
    };
  }

  const pdfParser = new PDFParser();

  const { documentMetadata, numberOfPages } = await useFileSystemPathFromEntity(
    documentEntity,
    async ({ fileSystemPath }) => {
      const documentJson = await new Promise<Output>((resolve, reject) => {
        pdfParser.on("pdfParser_dataError", (errData) =>
          reject(errData.parserError),
        );

        pdfParser.on("pdfParser_dataReady", (pdfData) => {
          resolve(pdfData);
        });

        // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        pdfParser.loadPDF(fileSystemPath).catch((err) => reject(err));
      });

      const numPages = documentJson.Pages.length;

      /**
       * @todo H-3620: handle documents exceeding Vertex AI limit of 30MB
       */

      const metadata = await getLlmAnalysisOfDoc({
        fileEntity: documentEntity,
      });

      return {
        documentMetadata: metadata,
        numberOfPages: numPages,
      };
    },
  );

  const {
    authors,
    documentMetadata: { entityTypeId, properties },
  } = documentMetadata;

  const entityTypeIds = new Set(documentEntity.metadata.entityTypeIds);
  entityTypeIds.add(entityTypeId);

  const filename =
    documentEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
    ] ??
    documentEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"
    ]!;

  const title = properties.value[systemPropertyTypes.title.propertyTypeBaseUrl]
    ?.value as string | undefined;

  const sourceProvenance: SourceProvenance = {
    type: "document",
    authors: (authors ?? []).map((author) => author.name),
    entityId: documentEntityId,
    location: { uri: fileUrl, name: title ?? filename },
  };

  const provenance: ProvidedEntityEditionProvenance = {
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

  const persistedDocumentEntityMetadata: PersistedEntityMetadata = {
    entityId: updatedEntity.entityId,
    operation: "update",
  };

  logProgress([
    {
      persistedEntityMetadata: persistedDocumentEntityMetadata,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "PersistedEntityMetadata",
    },
  ]);

  const proposedEntities =
    await generateDocumentProposedEntitiesAndCreateClaims({
      aiAssistantAccountId,
      documentEntityId,
      documentMetadata: { authors },
      documentTitle: title ?? filename,
      provenance,
      propertyProvenance,
    });

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "proposedEntities",
            payload: {
              kind: "ProposedEntity",
              value: proposedEntities,
            },
          },
          {
            outputName: "updatedDocumentEntity",
            payload: {
              kind: "PersistedEntityMetadata",
              value: persistedDocumentEntityMetadata,
            },
          },
        ],
      },
    ],
  };
};
