import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  isStorageType,
  storageProviderLookup,
} from "@local/hash-backend-utils/file-storage";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  DOCXDocumentProperties,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/docxdocument";
import type { PDFDocumentProperties } from "@local/hash-isomorphic-utils/system-types/pdfdocument";
import type { PPTXPresentationProperties } from "@local/hash-isomorphic-utils/system-types/pptxpresentation";
import type { Entity } from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import type { UpdateEntityHookCallback } from "../update-entity-hooks";

export const entityTypesToParseTextFrom: VersionedUrl[] = [
  systemEntityTypes.docxDocument.entityTypeId,
  systemEntityTypes.pdfDocument.entityTypeId,
  systemEntityTypes.pptxPresentation.entityTypeId,
];

type FileEntityToParseProperties =
  | DOCXDocumentProperties
  | PDFDocumentProperties
  | PPTXPresentationProperties;

export const parseTextFromFileAfterUpdateEntityHookCallback: UpdateEntityHookCallback =
  async ({ entity, updatedProperties, context, authentication }) => {
    const { temporalClient } = context;

    const fileEntity = entity as unknown as Entity<FileEntityToParseProperties>;

    const {
      textualContent,
      fileStorageKey,
      fileStorageProvider,
      uploadCompletedAt,
    } = simplifyProperties(updatedProperties as FileEntityToParseProperties);

    if (
      !textualContent &&
      fileStorageKey &&
      fileStorageProvider &&
      // We only want to trigger the temporal workflow if the file upload has completed
      uploadCompletedAt &&
      isStorageType(fileStorageProvider)
    ) {
      const storageProvider = storageProviderLookup[fileStorageProvider];

      if (!storageProvider) {
        /** @todo: do we need to handle this? (i.e initialize the storage provider?) */
        return;
      }

      const presignedFileDownloadUrl = await storageProvider.presignDownload({
        entity: fileEntity,
        key: fileStorageKey,
        expiresInSeconds: 60 * 60, // 1 hour
      });

      const workflowId = `${entity.metadata.recordId.editionId}-parse-text-from-file-workflow-id`;

      const fileEntityOwnedById = extractOwnedByIdFromEntityId(
        fileEntity.metadata.recordId.entityId,
      );

      const webMachineActorId = await getWebMachineActorId(
        context,
        authentication,
        {
          ownedById: fileEntityOwnedById,
        },
      );

      try {
        await temporalClient.workflow.execute<
          (params: ParseTextFromFileParams) => Promise<void>
        >("parseTextFromFile", {
          taskQueue: "ai",
          args: [
            {
              presignedFileDownloadUrl,
              fileEntity: {
                ...fileEntity,
                properties: updatedProperties as FileProperties,
              },
              webMachineActorId,
            },
          ],
          workflowId,
          retry: {
            maximumAttempts: 1,
          },
        });
      } catch (error) {
        /** @todo: figure out whether this should be logged */
        return undefined;
      }
    }
  };
