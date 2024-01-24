import { VersionedUrl } from "@blockprotocol/type-system";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { DOCXDocumentProperties } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import type { PDFDocumentProperties } from "@local/hash-isomorphic-utils/system-types/pdfdocument";
import type { PPTXPresentationProperties } from "@local/hash-isomorphic-utils/system-types/pptxpresentation";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { isStorageType, storageProviderLookup } from "../../../../../storage";
import { UpdateEntityHookCallback } from "../update-entity-hooks";

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

    const docxFileEntity =
      entity as unknown as Entity<FileEntityToParseProperties>;

    const { textualContent, fileStorageKey, fileStorageProvider } =
      simplifyProperties(updatedProperties as FileEntityToParseProperties);

    if (
      !textualContent &&
      fileStorageKey &&
      fileStorageProvider &&
      isStorageType(fileStorageProvider) &&
      temporalClient
    ) {
      const storageProvider = storageProviderLookup[fileStorageProvider];

      if (!storageProvider) {
        /** @todo: do we need to handle this? (i.e initialize the storage provider?) */
        return;
      }

      const presignedFileDownloadUrl = await storageProvider.presignDownload({
        entity: docxFileEntity,
        key: fileStorageKey,
        expiresInSeconds: 60 * 60, // 1 hour
      });

      const workflowId = `${entity.metadata.recordId.editionId}-parse-text-from-file-workflow-id`;

      const fileEntityOwnedById = extractOwnedByIdFromEntityId(
        docxFileEntity.metadata.recordId.entityId,
      );

      const webMachineActorId = await getWebMachineActorId(
        context,
        authentication,
        {
          ownedById: fileEntityOwnedById,
        },
      );

      try {
        /** @todo: ensure this doesn't crash the node API */
        void temporalClient.workflow.execute<
          (params: ParseTextFromFileParams) => Promise<void>
        >("parseTextFromFile", {
          taskQueue: "ai",
          args: [
            {
              presignedFileDownloadUrl,
              fileEntity: docxFileEntity,
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
