import { useMutation } from "@apollo/client";
import { useCallback, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";

import {
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";

import {
  archiveEntityMutation,
  createEntityMutation,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import {
  createFileFromUrl,
  requestFileUpload,
} from "../graphql/queries/knowledge/file.queries";
import {
  FileUploadProgressContext,
  FileUploadsContext,
} from "./file-upload-context";
import { uploadFileToStorageProvider } from "./upload-to-storage-provider";

import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  PresignedPut,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../graphql/api-types.gen";
import type {
  FileUpload,
  FileUploadComplete,
  FileUploadRequestData,
  FileUploadsContextValue,
  FileUploadsProgress,
} from "./file-upload-context";
import type { BaseUrl } from "@blockprotocol/type-system";
import type {
  File as FileEntity,
  UploadCompletedAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { PropsWithChildren } from "react";

/**
 * Provides an abstraction for uploading files, and a central place to track the status of uploads
 */
export const FileUploadsProvider = ({ children }: PropsWithChildren) => {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const [uploadsProgress, setUploadsProgress] = useState<FileUploadsProgress>(
    {},
  );

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);
  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const [createFileFromUrlFn] = useMutation<
    CreateFileFromUrlMutation,
    CreateFileFromUrlMutationVariables
  >(createFileFromUrl);

  const updateUpload = useCallback(
    (updatedUpload: FileUpload) =>
      setUploads((currentUploads) =>
        currentUploads.map((upload) =>
          upload.requestId === updatedUpload.requestId ? updatedUpload : upload,
        ),
      ),
    [],
  );

  const processFileUpload = useCallback(
    async ({
      existingUpload,
      fileData,
      linkedEntityData,
      makePublic,
      webId,
      requestId,
      upload,
    }: Omit<FileUploadRequestData, "onComplete" | "returnBeforeCompletion"> & {
      upload: FileUpload;
      existingUpload?: FileUpload | null;
    }): Promise<FileUpload> => {
      if (existingUpload && existingUpload.status !== "error") {
        throw new Error(
          `File upload request ${requestId} is not in error status, cannot retry. Current status: ${existingUpload.status}`,
        );
      }

      const { description, name } = fileData;

      // if retrying an earlier request, we might already have a file entity
      let fileEntity =
        "createdEntities" in upload
          ? upload.createdEntities?.fileEntity
          : undefined;

      // First, upload the file (either from a url or from a file)
      if (!fileEntity && "url" in fileData && fileData.url.trim()) {
        try {
          const { data, errors } = await createFileFromUrlFn({
            variables: {
              description,
              displayName: name,
              makePublic,
              url: fileData.url,
              ...("fileEntityUpdateInput" in fileData
                ? { fileEntityUpdateInput: fileData.fileEntityUpdateInput }
                : {
                    fileEntityCreationInput: {
                      webId,
                      ...fileData.fileEntityCreationInput,
                    },
                  }),
            },
          });

          if (!data || errors) {
            throw new Error(errors?.[0]?.message ?? "unknown error");
          }

          fileEntity = new HashEntity<FileEntity>(data.createFileFromUrl);
        } catch (err) {
          // createFileFromUrlFn might itself throw rather than return errors, thus this catch

          const errorMessage = `An error occurred while uploading the file from url ${
            fileData.url
          }: ${(err as Error).message}`;

          const updatedUpload: FileUpload = {
            ...upload,
            failedStep: "creating-file-entity",
            status: "error",
            errorMessage,
          };

          updateUpload(updatedUpload);

          return updatedUpload;
        }
      } else if (
        "file" in fileData &&
        // if we failed at link deletion / creation, we've already done all this
        existingUpload?.failedStep !== "creating-link-entity" &&
        existingUpload?.failedStep !== "archiving-link-entity"
      ) {
        let presignedPut: PresignedPut | undefined =
          "presignedPut" in upload ? upload.presignedPut : undefined;

        try {
          if (!fileEntity) {
            // if we are resuming a previous step and have a file entity, we can skip this step
            const { data, errors } = await requestFileUploadFn({
              variables: {
                description,
                displayName: name,
                name: fileData.file.name,
                size: fileData.file.size,
                makePublic,
                ...("fileEntityUpdateInput" in fileData
                  ? { fileEntityUpdateInput: fileData.fileEntityUpdateInput }
                  : {
                      fileEntityCreationInput: {
                        webId,
                        ...fileData.fileEntityCreationInput,
                      },
                    }),
              },
            });

            if (!data || errors) {
              throw new Error(errors?.[0]?.message ?? "unknown error");
            }

            fileEntity = new HashEntity<FileEntity>(
              data.requestFileUpload.entity,
            );

            presignedPut = data.requestFileUpload.presignedPut;

            // eslint-disable-next-line no-param-reassign
            upload = {
              ...upload,
              createdEntities: { fileEntity },
              presignedPut,
              status: "uploading-file-locally",
            };
            updateUpload(upload);
          }

          if (!presignedPut) {
            // We should never get here as we should have the presigned form from an existing upload or the requestFileUploadFn call above
            throw new Error(
              `No presignedPut found for requestId ${requestId}, cannot upload file`,
            );
          }

          /**
           * Upload file with presignedPost data to storage provider
           */
          await uploadFileToStorageProvider(
            presignedPut,
            fileData.file,
            (progress) => {
              setUploadsProgress((prevProgress) => ({
                ...prevProgress,
                [upload.requestId]: progress,
              }));
            },
          );

          const uploadCompletedAt = new Date();

          await updateEntity({
            variables: {
              entityUpdate: {
                entityId: fileEntity.metadata.recordId.entityId,
                propertyPatches: [
                  {
                    op: "add",
                    path: [
                      "https://hash.ai/@h/types/property-type/upload-completed-at/" satisfies keyof FileEntity["properties"] as BaseUrl,
                    ],
                    property: {
                      value: uploadCompletedAt.toISOString(),
                      metadata: {
                        dataTypeId:
                          "https://hash.ai/@h/types/data-type/datetime/v/1",
                      },
                    } satisfies UploadCompletedAtPropertyValueWithMetadata,
                  },
                ],
              },
            },
          });
        } catch (err) {
          // requestFileUploadFn might itself throw rather than return errors, thus this catch

          const errorMessage = `An error occurred while uploading the file ${
            fileData.file.name
          }: ${(err as Error).message}`;

          const updatedUpload: FileUpload = {
            ...upload,
            ...(fileEntity ? { createdEntities: { fileEntity } } : {}),
            presignedPut,
            status: "error",
            failedStep: "uploading-file-locally",
            errorMessage,
          };
          updateUpload(updatedUpload);

          return updatedUpload;
        }
      }

      if (!fileEntity) {
        throw new Error(
          "Somehow no file entity was created and no earlier error thrown.",
        );
      }

      // If we don't have any links to delete or create, we're done
      if (!linkedEntityData || linkedEntityData.skipLinkCreationAndDeletion) {
        const updatedUpload: FileUploadComplete = {
          ...upload,
          status: "complete",
          createdEntities: { fileEntity },
        };
        updateUpload(updatedUpload);
        upload.onComplete?.(updatedUpload);
        return updatedUpload;
      }

      const {
        linkedEntityId,
        linkEntityIdToDelete,
        linkProperties,
        linkEntityTypeId,
      } = linkedEntityData;

      // Delete the old link entity if requested
      if (
        linkEntityIdToDelete &&
        existingUpload?.failedStep !== "creating-link-entity"
      ) {
        // eslint-disable-next-line no-param-reassign
        upload = {
          ...upload,
          createdEntities: {
            fileEntity,
          },
          status: "archiving-link-entity",
        };
        updateUpload(upload);

        try {
          const { data: archiveData, errors: archiveErrors } =
            await archiveEntity({
              variables: {
                entityId: linkEntityIdToDelete,
              },
            });

          if (!archiveData || archiveErrors) {
            throw new Error(archiveErrors?.[0]?.message ?? "unknown error");
          }
        } catch (err) {
          // archiveEntity might itself throw rather than return errors, thus this catch
          const errorMessage = `Error archiving link entity with id ${linkEntityIdToDelete}: ${
            (err as Error).message
          }`;
          const updatedUpload: FileUpload = {
            ...upload,
            createdEntities: { fileEntity },
            failedStep: "archiving-link-entity",
            status: "error",
            errorMessage,
          };
          updateUpload(updatedUpload);

          return updatedUpload;
        }
      }

      // eslint-disable-next-line no-param-reassign
      upload = {
        ...upload,
        createdEntities: {
          fileEntity,
        },
        status: "creating-link-entity",
      };

      updateUpload(upload);

      try {
        const { data, errors } = await createEntity({
          variables: {
            entityTypeIds: [linkEntityTypeId],
            linkData: {
              leftEntityId: linkedEntityId,
              rightEntityId: fileEntity.metadata.recordId.entityId,
            },
            properties: linkProperties
              ? mergePropertyObjectAndMetadata(linkProperties, undefined)
              : { value: {} },
            makePublic,
          },
        });

        if (!data || errors) {
          throw new Error(errors?.[0]?.message ?? "unknown error");
        }

        const linkEntity = new HashLinkEntity(data.createEntity);

        const updatedUpload: FileUpload = {
          ...upload,
          status: "complete",
          createdEntities: {
            fileEntity,
            linkEntity,
          },
        };
        updateUpload(updatedUpload);
        upload.onComplete?.(updatedUpload);
        return updatedUpload;
      } catch (err) {
        const errorMessage = `Error creating link entity: ${
          (err as Error).message
        }`;

        const updatedUpload: FileUpload = {
          ...upload,
          createdEntities: { fileEntity },
          failedStep: "creating-link-entity",
          status: "error",
          errorMessage,
        };
        updateUpload(updatedUpload);

        return updatedUpload;
      }
    },
    [
      archiveEntity,
      createEntity,
      createFileFromUrlFn,
      requestFileUploadFn,
      updateUpload,
      updateEntity,
    ],
  );

  const uploadFile: FileUploadsContextValue["uploadFile"] = useCallback(
    async ({
      fileData,
      linkedEntityData,
      makePublic,
      onComplete,
      webId,
      requestId,
      returnBeforeCompletion,
    }) => {
      const existingUpload = requestId
        ? uploads.find((upload) => upload.requestId === requestId)
        : null;

      if (requestId && !existingUpload) {
        throw new Error(
          `Could not find existing upload with requestId ${requestId}`,
        );
      }

      const newRequestId = requestId ? undefined : uuid();

      const upload: FileUpload =
        existingUpload ??
        ({
          createdAt: new Date().toISOString(),
          fileData,
          linkedEntityData,
          makePublic,
          onComplete,
          webId,
          requestId: newRequestId!,
          returnBeforeCompletion,
          status: "creating-file-entity",
        } satisfies FileUpload);

      if (!existingUpload) {
        setUploads((prevUploads) => [...prevUploads, upload]);
      }

      if (returnBeforeCompletion) {
        void processFileUpload({
          existingUpload,
          fileData,
          linkedEntityData,
          makePublic,
          webId,
          requestId,
          upload,
        });
        return upload;
      }

      return await processFileUpload({
        existingUpload,
        fileData,
        linkedEntityData,
        makePublic,
        webId,
        requestId,
        upload,
      });
    },
    [processFileUpload, uploads],
  );

  const mainContextValue: FileUploadsContextValue = useMemo(
    () => ({ uploads, uploadFile }),
    [uploadFile, uploads],
  );

  return (
    <FileUploadsContext.Provider value={mainContextValue}>
      <FileUploadProgressContext.Provider value={uploadsProgress}>
        {children}
      </FileUploadProgressContext.Provider>
    </FileUploadsContext.Provider>
  );
};
