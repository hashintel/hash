import type {   createContext,
PropsWithChildren ,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import { useMutation } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  Entity,
  LinkEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type {
  File as FileEntity,
  UploadCompletedAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";

import type { UploadFileRequestData } from "../components/hooks/block-protocol-functions/knowledge/knowledge-shim";
import type {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
 AuthorizationSubjectKind,  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  PresignedPut,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables } from "../graphql/api-types.gen";
import {
  addEntityViewerMutation,
  archiveEntityMutation,
  createEntityMutation,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import {
  createFileFromUrl,
  requestFileUpload,
} from "../graphql/queries/knowledge/file.queries";

import { uploadFileToStorageProvider } from "./upload-to-storage-provider";

/**
 * If an uploaded file is to be linked to another entity, this data describes the link.
 */
interface FileLinkData {
  // An existing link to delete when creating the new link, if the link is replacing one that already exists
  linkEntityIdToDelete?: EntityId;
  // The entityId of the entity to link to
  linkedEntityId: EntityId;
  // The entityTypeId of the link entity to create
  linkEntityTypeId: VersionedUrl;
  // The properties for the link entity to create, if any
  linkProperties?: PropertyObject;
  /**
   * If true, don't actually create or delete the specified link entity, just track this metadata in the upload object.
   *
   * This is useful for when the caller wants to manage link creation themselves, but track the progress of the file upload
   * - e.g. For editing draft entities in the entity editor, we maintain draft link state and defer API calls.
   */
  skipLinkCreationAndDeletion?: boolean;
}

interface FileUploadRequestData {
  fileData: UploadFileRequestData;
  linkedEntityData?: FileLinkData;
  // whether or not to make the created file entity and any link entities public
  makePublic: boolean;
  ownedById: OwnedById;
  // Pass if retrying an earlier request
  requestId?: string;
  // A function which will be called when the upload is complete
  onComplete?: (upload: FileUploadComplete) => unknown;
}

interface FileUploadEntities {
  fileEntity: Entity<FileEntity>;
  linkEntity?: LinkEntity;
}

type FileUploadStatus =
  | "creating-file-entity"
  | "uploading-file-locally"
  | "creating-link-entity"
  | "archiving-link-entity"
  | "error"
  | "complete";

type FileUploadVariant<T extends { status: FileUploadStatus }> =
  FileUploadRequestData & { requestId: string } & T;

type FileCreatingFileEntity = FileUploadVariant<{
  status: "creating-file-entity";
}>;

type FileUploadUploading = FileUploadVariant<{
  createdEntities: Pick<FileUploadEntities, "fileEntity">;
  presignedPut: PresignedPut;
  status: "uploading-file-locally";
}>;

type FileUploadDeletingLinkEntity = FileUploadVariant<{
  createdEntities: Pick<FileUploadEntities, "fileEntity">;
  status: "archiving-link-entity";
}>;

type FileUploadCreatingLinkEntity = FileUploadVariant<{
  createdEntities: Pick<FileUploadEntities, "fileEntity">;
  status: "creating-link-entity";
}>;

type FileUploadError = FileUploadVariant<{
  createdEntities?: Pick<FileUploadEntities, "fileEntity">;
  errorMessage: string;
  failedStep: FileUploadStatus;
  presignedPut?: PresignedPut;
  status: "error";
}>;

type FileUploadComplete = FileUploadVariant<{
  createdEntities: FileUploadEntities;
  status: "complete";
}>;

export type FileUpload =
  | FileCreatingFileEntity
  | FileUploadDeletingLinkEntity
  | FileUploadUploading
  | FileUploadCreatingLinkEntity
  | FileUploadError
  | FileUploadComplete;

export interface FileUploadsContextValue {
  uploads: FileUpload[];
  uploadFile: (args: FileUploadRequestData) => Promise<FileUpload>;
}

// The main context to store file upload metadata and the function to request a new upload
const FileUploadsContext = createContext<null | FileUploadsContextValue>(null);

interface FileUploadsProgress {
  [requestId: string]: number;
}

// A separate context for granular upload progress so that components that don't care about it aren't affected by it
const FileUploadProgressContext = createContext<
  FileUploadsProgress | undefined
>(undefined);

/**
 * Provides an abstraction for uploading files, and a central place to track the status of uploads.
 */
export const FileUploadsProvider = ({ children }: PropsWithChildren) => {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const [uploadsProgress, setUploadsProgress] = useState<FileUploadsProgress>(
    {},
  );

  const [addEntityViewer] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation);

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
      { setUploads((currentUploads) =>
        currentUploads.map((upload) =>
          upload.requestId === updatedUpload.requestId ? updatedUpload : upload,
        ),
      ); },
    [],
  );

  const uploadFile: FileUploadsContextValue["uploadFile"] = useCallback(
    async ({
      fileData,
      linkedEntityData,
      makePublic,
      onComplete,
      ownedById,
      requestId,
    }) => {
      const existingUpload = requestId
        ? uploads.find((upload) => upload.requestId === requestId)
        : null;

      if (requestId && !existingUpload) {
        throw new Error(
          `Could not find existing upload with requestId ${requestId}`,
        );
      }

      if (existingUpload && existingUpload.status !== "error") {
        throw new Error(
          `File upload request ${requestId} is not in error status, cannot retry. Current status: ${existingUpload.status}`,
        );
      }

      const newRequestId = requestId ? undefined : uuid();

      const upload =
        existingUpload ??
        ({
          fileData,
          linkedEntityData,
          makePublic,
          onComplete,
          ownedById,
          requestId: newRequestId!,
          status: "creating-file-entity",
        } satisfies FileUpload);

      if (!existingUpload) {
        setUploads((previousUploads) => [...previousUploads, upload]);
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
              url: fileData.url,
              ...("fileEntityUpdateInput" in fileData
                ? { fileEntityUpdateInput: fileData.fileEntityUpdateInput }
                : {
                    fileEntityCreationInput: {
                      ownedById,
                      ...fileData.fileEntityCreationInput,
                    },
                  }),
            },
          });

          if (!data || errors) {
            throw new Error(errors?.[0]?.message ?? "unknown error");
          }

          fileEntity = new Entity<FileEntity>(data.createFileFromUrl);

          if (makePublic) {
            /** @todo: make entity public as part of `createEntity` query once this is supported */
            await addEntityViewer({
              variables: {
                entityId: fileEntity.metadata.recordId.entityId,
                viewer: { kind: AuthorizationSubjectKind.Public },
              },
            });
          }
        } catch (error) {
          // createFileFromUrlFn might itself throw rather than return errors, thus this catch

          const errorMessage = `An error occurred while uploading the file from url ${
            fileData.url
          }: ${(error as Error).message}`;

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
                ...("fileEntityUpdateInput" in fileData
                  ? { fileEntityUpdateInput: fileData.fileEntityUpdateInput }
                  : {
                      fileEntityCreationInput: {
                        ownedById,
                        ...fileData.fileEntityCreationInput,
                      },
                    }),
              },
            });

            if (!data || errors) {
              throw new Error(errors?.[0]?.message ?? "unknown error");
            }

            fileEntity = new Entity<FileEntity>(data.requestFileUpload.entity);

            if (makePublic) {
              /** @todo: make entity public as part of `createEntity` query once this is supported */
              await addEntityViewer({
                variables: {
                  entityId: fileEntity.metadata.recordId.entityId,
                  viewer: { kind: AuthorizationSubjectKind.Public },
                },
              });
            }

            presignedPut = data.requestFileUpload.presignedPut;

            const updatedUpload: FileUpload = {
              ...upload,
              createdEntities: { fileEntity },
              presignedPut,
              status: "uploading-file-locally",
            };

            updateUpload(updatedUpload);
          }

          if (!presignedPut) {
            // We should never get here as we should have the presigned form from an existing upload or the requestFileUploadFn call above
            throw new Error(
              `No presignedPut found for requestId ${requestId}, cannot upload file`,
            );
          }

          /**
           * Upload file with presignedPost data to storage provider.
           */
          await uploadFileToStorageProvider(
            presignedPut,
            fileData.file,
            (progress) => {
              setUploadsProgress((previousProgress) => ({
                ...previousProgress,
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
                      "https://hash.ai/@hash/types/property-type/upload-completed-at/" satisfies keyof FileEntity["properties"] as BaseUrl,
                    ],
                    property: {
                      value: uploadCompletedAt.toISOString(),
                      metadata: {
                        dataTypeId:
                          "https://hash.ai/@hash/types/data-type/datetime/v/1",
                      },
                    } satisfies UploadCompletedAtPropertyValueWithMetadata,
                  },
                ],
              },
            },
          });
        } catch (error) {
          // requestFileUploadFn might itself throw rather than return errors, thus this catch

          const errorMessage = `An error occurred while uploading the file ${
            fileData.file.name
          }: ${(error as Error).message}`;

          const updatedUpload: FileUpload = {
            ...upload,
            ...(fileEntity ? { createdEntities: { fileEntity } } : {}),
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
        updateUpload({
          ...upload,
          createdEntities: {
            fileEntity,
          },
          status: "archiving-link-entity",
        });

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
        } catch (error) {
          // archiveEntity might itself throw rather than return errors, thus this catch
          const errorMessage = `Error archiving link entity with id ${linkEntityIdToDelete}: ${
            (error as Error).message
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

      updateUpload({
        ...upload,
        createdEntities: {
          fileEntity,
        },
        status: "creating-link-entity",
      });

      try {
        const { data, errors } = await createEntity({
          variables: {
            entityTypeId: linkEntityTypeId,
            linkData: {
              leftEntityId: linkedEntityId,
              rightEntityId: fileEntity.metadata.recordId.entityId,
            },
            properties: linkProperties
              ? mergePropertyObjectAndMetadata(linkProperties, undefined)
              : { value: {} },
          },
        });

        if (!data || errors) {
          throw new Error(errors?.[0]?.message ?? "unknown error");
        }

        const linkEntity = new LinkEntity(data.createEntity);

        if (makePublic) {
          /** @todo: make entity public as part of `createEntity` query once this is supported */
          await addEntityViewer({
            variables: {
              entityId: linkEntity.metadata.recordId.entityId,
              viewer: { kind: AuthorizationSubjectKind.Public },
            },
          });
        }

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
      } catch (error) {
        const errorMessage = `Error creating link entity: ${
          (error as Error).message
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
      addEntityViewer,
      archiveEntity,
      createEntity,
      createFileFromUrlFn,
      requestFileUploadFn,
      updateUpload,
      updateEntity,
      uploads,
    ],
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

export const useFileUploads = () => {
  const fileUploadsContext = useContext(FileUploadsContext);

  if (!fileUploadsContext) {
    throw new Error("no FileUploadsContext value has been provided");
  }

  return fileUploadsContext;
};

export const useFileUploadsProgress = () => {
  const fileUploadProgressContext = useContext(FileUploadProgressContext);

  if (!fileUploadProgressContext) {
    throw new Error("no FileUploadProgressContext value has been provided");
  }

  return fileUploadProgressContext;
};
