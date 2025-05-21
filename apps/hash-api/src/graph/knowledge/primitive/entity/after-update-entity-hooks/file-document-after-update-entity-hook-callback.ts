import type { VersionedUrl } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import {
  isStorageType,
  storageProviderLookup,
} from "@local/hash-backend-utils/file-storage";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import {
  getDefinedPropertyFromPatchesGetter,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { DOCXDocument } from "@local/hash-isomorphic-utils/system-types/docxdocument";
import type { File } from "@local/hash-isomorphic-utils/system-types/file";
import type { PDFDocument } from "@local/hash-isomorphic-utils/system-types/pdfdocument";
import type { PPTXPresentation } from "@local/hash-isomorphic-utils/system-types/pptxpresentation";

import type { AfterUpdateEntityHookCallback } from "../update-entity-hooks";

export const entityTypesToParseTextFrom: VersionedUrl[] = [
  systemEntityTypes.docxDocument.entityTypeId,
  systemEntityTypes.pdfDocument.entityTypeId,
  systemEntityTypes.pptxPresentation.entityTypeId,
];

type FileEntityToParse = DOCXDocument | PDFDocument | PPTXPresentation;

export const parseTextFromFileAfterUpdateEntityHookCallback: AfterUpdateEntityHookCallback =
  async ({
    previousEntity,
    propertyPatches,
    context,
    authentication,
    updatedEntity,
  }) => {
    const { temporalClient } = context;

    const previousEntityProperties =
      previousEntity as HashEntity<FileEntityToParse>;

    const getNewValueForPath =
      getDefinedPropertyFromPatchesGetter<FileEntityToParse["properties"]>(
        propertyPatches,
      );

    const newFileStorageKey = getNewValueForPath(
      "https://hash.ai/@h/types/property-type/file-storage-key/",
    );

    const oldFileStorageKey =
      previousEntityProperties.properties[
        "https://hash.ai/@h/types/property-type/file-storage-key/"
      ];

    const { textualContent, fileStorageProvider, uploadCompletedAt } =
      simplifyProperties(
        updatedEntity.properties as FileEntityToParse["properties"],
      );

    if (textualContent && newFileStorageKey === oldFileStorageKey) {
      /**
       * We already have parsed textual content, and the file version hasn't changed
       */
      return;
    }

    if (
      !textualContent &&
      newFileStorageKey &&
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
        entity: updatedEntity as HashEntity<File>,
        key: newFileStorageKey,
        expiresInSeconds: 60 * 60, // 1 hour
      });

      const workflowId = `${updatedEntity.metadata.recordId.editionId}-parse-text-from-file-workflow-id`;

      const fileEntityWebId = extractWebIdFromEntityId(
        updatedEntity.metadata.recordId.entityId,
      );

      const webMachineActorId = await getWebMachineId(context, authentication, {
        webId: fileEntityWebId,
      }).then((maybeMachineId) => {
        if (!maybeMachineId) {
          throw new Error(
            `Failed to get web bot account ID for web ID: ${fileEntityWebId}`,
          );
        }
        return maybeMachineId;
      });

      try {
        await temporalClient.workflow.execute<
          (params: ParseTextFromFileParams) => Promise<void>
        >("parseTextFromFile", {
          taskQueue: "ai",
          args: [
            {
              presignedFileDownloadUrl,
              fileEntity: updatedEntity.toJSON(),
              webMachineActorId,
            },
          ],
          workflowId,
          retry: {
            maximumAttempts: 1,
          },
        });
      } catch {
        /** @todo: figure out whether this should be logged */
        return undefined;
      }
    }
  };
