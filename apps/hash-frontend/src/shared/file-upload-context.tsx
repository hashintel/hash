import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
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
  useState,
} from "react";
import { v4 as uuid } from "uuid";

import { UploadFileRequestData } from "../components/hooks/block-protocol-functions/knowledge/knowledge-shim";
import {
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  RequestFileUploadResponse,
} from "../graphql/api-types.gen";
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
  /**
   * Whether the file should be on the 'left' of the link, i.e. the file is the source (file --link--> entity)
   * @default false
   */
  fileOnLeftOfLink?: boolean;
};

type FileUploadRequestData = {
  fileData: UploadFileRequestData;
  linkedEntityData?: FileLinkData;
  ownedById: OwnedById;
};

type FileUpload = FileUploadRequestData & {
  errorMessage?: string;
  requestId: string;
  status:
    | "cancelled"
    | "complete"
    | "creating-link-entity"
    | "error"
    | "uploading-file";
};

export type FileUploadsContextValue = {
  uploads: FileUpload[];
  uploadFile: (
    args: FileUploadRequestData,
  ) => Promise<{ fileEntity: RemoteFile; linkEntity?: LinkEntity }>;
};

export const FileUploadsContext = createContext<null | FileUploadsContextValue>(
  null,
);

export const FileUploadsProvider = ({ children }: PropsWithChildren) => {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const [createFileFromUrlFn] = useMutation<
    CreateFileFromUrlMutation,
    CreateFileFromUrlMutationVariables
  >(createFileFromUrl);

  // @todo share this and the above with use-block-protocol-file-upload
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

      // Upload the file and get a file entity which describes it
      if ("url" in fileData && fileData.url.trim()) {
        try {
          const { data, errors } = await createFileFromUrlFn({
            variables: {
              ...fileData,
              ownedById,
            },
          });

          if (!data || errors) {
            throw new Error(
              `An error occurred while uploading the file from url ${
                fileData.url
              }: ${errors?.[0]?.message ?? "unknown error"}`,
            );
          }
          fileEntity = data.createFileFromUrl;
        } catch (err) {
          // createFileFromUrlFn might itself throw rather than return errors, thus this catch
          updateUpload({
            ...upload,
            status: "error",
            errorMessage: (err as Error).message,
          });
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
            throw new Error(
              `An error occurred while uploading the file ${
                fileData.file.name
              }: ${errors?.[0]?.message ?? "unknown error"}`,
            );
          }
          fileEntity = data.requestFileUpload;

          /**
           * Upload file with presignedPost data to storage provider
           */
          await uploadFileToStorageProvider(
            data.requestFileUpload.presignedPost,
            fileData.file,
          );
        } catch (err) {
          // requestFileUploadFn might itself throw rather than return errors, thus this catch
          updateUpload({
            ...upload,
            status: "error",
            errorMessage: (err as Error).message,
          });
          return;
        }
      }

      if (linkedEntityData) {
        updateUpload({
          ...upload,
          status: "creating-link-entity",
        });

        try {
          await createLinkEntity(fileEntity, linkedEntityData);
        } catch (err) {
          updateUpload({
            ...upload,
            status: "error",
            errorMessage: (err as Error).message,
          });
          return;
        }
      }

      if (initialOrg.hasAvatar) {
        // Delete the existing hasAvatar link, if any
        await archiveEntity({
          data: {
            entityId:
              initialOrg.hasAvatar.linkEntity.metadata.recordId.entityId,
          },
        });
      }

      // Create a new hasAvatar link from the org to the new file entity
      await createEntity({
        data: {
          entityTypeId: types.linkEntityType.hasAvatar.linkEntityTypeId,
          linkData: {
            leftEntityId: initialOrg.entityRecordId.entityId,
            rightEntityId: fileUploadData.metadata.recordId
              .entityId as EntityId,
          },
          properties: {},
        },
      });
    },
    [],
  );

  const value: FileUploadsContextValue = {
    uploadFile,
    uploads,
  };

  return (
    <FileUploadsContext.Provider value={}>
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
