import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { RemoteFile } from "@local/hash-isomorphic-utils/system-types/blockprotocol/shared";
import {
  EntityId,
  EntityPropertiesObject,
  OwnedById,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { v4 as uuid } from "uuid";

import { UploadFileRequestData } from "../components/hooks/block-protocol-functions/knowledge/knowledge-shim";
import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  RequestFileUploadResponse,
} from "../graphql/api-types.gen";
import {
  archiveEntityMutation,
  createEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import {
  createFileFromUrl,
  requestFileUpload,
} from "../graphql/queries/knowledge/file.queries";

/**
 * If an uploaded file is to be linked to another entity, this data describes the link
 */
type FileLinkData = {
  // An existing link to delete when creating the new link, if the link is replacing one that already exists
  linkEntityIdToDelete?: EntityId;
  // The entityId of the entity to link to
  linkedEntityId: EntityId;
  // The entityTypeId of the link entity to create
  linkTypeId: VersionedUrl;
  // The properties for the link entity to create, if any
  linkProperties?: EntityPropertiesObject;
};

type FileUploadRequestData = {
  fileData: UploadFileRequestData;
  linkedEntityData?: FileLinkData;
  ownedById: OwnedById;
};

type FileUploadEntities = { fileEntity: RemoteFile; linkEntity?: LinkEntity };

type FileUpload = FileUploadRequestData & {
  createdEntities?: FileUploadEntities;
  errorMessage?: string;
  requestId: string;
  status: "complete" | "creating-link-entity" | "error" | "uploading-file";
};

export type FileUploadsContextValue = {
  uploads: FileUpload[];
  uploadFile: (args: FileUploadRequestData) => Promise<FileUpload>;
};

export const FileUploadsContext = createContext<null | FileUploadsContextValue>(
  null,
);

/**
 * Provides an abstraction for uploading files, and a central place to track the status of uploads
 */
export const FileUploadsProvider = ({ children }: PropsWithChildren) => {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);
  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const [createFileFromUrlFn] = useMutation<
    CreateFileFromUrlMutation,
    CreateFileFromUrlMutationVariables
  >(createFileFromUrl);

  const uploadFileToStorageProvider = async (
    presignedPostData: RequestFileUploadResponse["presignedPost"],
    file: File,
  ) => {
    const formData = new FormData();
    const { url, fields } = presignedPostData;

    for (const [key, val] of Object.entries(fields)) {
      formData.append(key, val as string);
    }

    formData.append("file", file);

    return await fetch(url, {
      method: "POST",
      body: formData,
    });
  };

  const updateUpload = useCallback(
    (updatedUpload: FileUpload) =>
      setUploads((currentUploads) =>
        currentUploads.map((upload) =>
          upload.requestId === updatedUpload.requestId ? updatedUpload : upload,
        ),
      ),
    [],
  );

  const uploadFile: FileUploadsContextValue["uploadFile"] = useCallback(
    async ({ fileData, linkedEntityData, ownedById }) => {
      const requestId = uuid();

      const upload: FileUpload = {
        fileData,
        ownedById,
        requestId,
        status: "uploading-file",
      };

      setUploads((prevUploads) => [...prevUploads, upload]);

      let fileEntity;

      // First, upload the file (either from a url or from a file)
      if ("url" in fileData && fileData.url.trim()) {
        try {
          const { data, errors } = await createFileFromUrlFn({
            variables: {
              ...fileData,
              ownedById,
            },
          });

          if (!data || errors) {
            throw new Error(errors?.[0]?.message ?? "unknown error");
          }

          fileEntity = data.createFileFromUrl as unknown as RemoteFile;
        } catch (err) {
          // createFileFromUrlFn might itself throw rather than return errors, thus this catch

          const errorMessage = `An error occurred while uploading the file from url ${
            fileData.url
          }: ${(err as Error).message}`;

          updateUpload({
            ...upload,
            status: "error",
            errorMessage,
          });
          throw new Error(errorMessage, { cause: err });
        }
      } else if ("file" in fileData) {
        try {
          const { data, errors } = await requestFileUploadFn({
            variables: {
              ...fileData,
              ownedById,
              size: fileData.file.size,
            },
          });

          if (!data || errors) {
            throw new Error(errors?.[0]?.message ?? "unknown error");
          }

          fileEntity = data.requestFileUpload.entity as unknown as RemoteFile;

          /**
           * Upload file with presignedPost data to storage provider
           */
          await uploadFileToStorageProvider(
            data.requestFileUpload.presignedPost,
            fileData.file,
          );
        } catch (err) {
          const errorMessage = `An error occurred while uploading the file ${
            fileData.file.name
          }: ${(err as Error).message}`;

          // requestFileUploadFn might itself throw rather than return errors, thus this catch
          updateUpload({
            ...upload,
            status: "error",
            errorMessage,
          });

          throw new Error(errorMessage, { cause: err });
        }
      }

      if (!fileEntity) {
        throw new Error(
          "Somehow no file entity was created and no earlier error thrown.",
        );
      }

      // If no linked entity data was provided, we're done
      if (!linkedEntityData) {
        const updatedUpload: FileUpload = {
          ...upload,
          status: "complete",
          createdEntities: { fileEntity },
        };
        updateUpload(updatedUpload);
        return updatedUpload;
      }

      const {
        linkedEntityId,
        linkEntityIdToDelete,
        linkProperties,
        linkTypeId,
      } = linkedEntityData;

      updateUpload({
        ...upload,
        status: "creating-link-entity",
      });

      // Delete the old link entity if requested
      if (linkEntityIdToDelete) {
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
          const errorMessage = `Error archiving link entity with id ${linkEntityIdToDelete}: ${
            (err as Error).message
          }`;
          updateUpload({
            ...upload,
            createdEntities: { fileEntity },
            status: "error",
            errorMessage,
          });
          throw new Error(errorMessage, { cause: err });
        }
      }

      try {
        const { data, errors } = await createEntity({
          variables: {
            entityTypeId: linkTypeId,
            linkData: {
              leftEntityId: linkedEntityId,
              rightEntityId: fileEntity.metadata.recordId.entityId as EntityId,
            },
            properties: linkProperties ?? {},
          },
        });

        if (!data || errors) {
          throw new Error(errors?.[0]?.message ?? "unknown error");
        }

        const updatedUpload: FileUpload = {
          ...upload,
          status: "complete",
          createdEntities: {
            fileEntity,
            linkEntity: data.createEntity as LinkEntity,
          },
        };
        updateUpload(updatedUpload);
        return updatedUpload;
      } catch (err) {
        const errorMessage = `Error creating link entity: ${
          (err as Error).message
        }`;
        updateUpload({
          ...upload,
          createdEntities: { fileEntity },
          status: "error",
          errorMessage,
        });
        throw new Error(errorMessage, { cause: err });
      }
    },
    [
      archiveEntity,
      createEntity,
      createFileFromUrlFn,
      requestFileUploadFn,
      updateUpload,
    ],
  );

  const value: FileUploadsContextValue = useMemo(
    () => ({ uploads, uploadFile }),
    [uploadFile, uploads],
  );

  return (
    <FileUploadsContext.Provider value={value}>
      {children}
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
