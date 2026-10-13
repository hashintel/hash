import { createContext, useContext } from "react";

import type { UploadFileRequestData } from "../components/hooks/block-protocol-functions/knowledge/knowledge-shim";
import type { PresignedPut } from "../graphql/api-types.gen";
import type {
  EntityId,
  PropertyObject,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * If an uploaded file is to be linked to another entity, this data describes the link
 */
type FileLinkData = {
  // An existing link to delete when creating the new link, if the link is replacing one that already exists
  linkEntityIdToDelete?: EntityId;
  // The entityId of the entity to link to
  linkedEntityId: EntityId;
  // The entityTypeId of the link entity to create
  linkEntityTypeId: VersionedUrl;
  // The properties for the link entity to create, if any
  linkProperties?: PropertyObject;
  /**
   * If true, don't actually create or delete the specified link entity, just track this metadata in the upload object
   *
   * This is useful for when the caller wants to manage link creation themselves, but track the progress of the file upload
   * - e.g. for editing draft entities in the entity editor, we maintain draft link state and defer API calls
   */
  skipLinkCreationAndDeletion?: boolean;
};

export type FileUploadRequestData = {
  fileData: UploadFileRequestData;
  linkedEntityData?: FileLinkData;
  // whether or not to make the created file entity and any link entities public
  makePublic: boolean;
  webId: WebId;
  // Pass if retrying an earlier request
  requestId?: string;
  // A function which will be called when the upload is complete
  onComplete?: (upload: FileUploadComplete) => unknown;
  /**
   * If true, return the file upload as soon as it is created, rather than waiting for upload to be complete.
   * This allows accessing the requestId immediately for use in monitoring progress via useFileUploadProgress
   */
  returnBeforeCompletion?: boolean;
};

type FileUploadEntities = {
  fileEntity: HashEntity<FileEntity>;
  linkEntity?: HashLinkEntity;
};

type FileUploadStatus =
  | "creating-file-entity"
  | "uploading-file-locally"
  | "creating-link-entity"
  | "archiving-link-entity"
  | "error"
  | "complete";

type FileUploadVariant<T extends { status: FileUploadStatus }> =
  FileUploadRequestData & { createdAt: string; requestId: string } & T;

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

export type FileUploadComplete = FileUploadVariant<{
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

export type FileUploadsContextValue = {
  /**
   * Provides all registered file uploads.
   * Does NOT rerender as file upload progresses
   * – if you need to subscribe to file upload status, use useFileUploadsProgress
   */
  uploads: FileUpload[];
  uploadFile: (args: FileUploadRequestData) => Promise<FileUpload>;
};

// The main context to store file upload metadata and the function to request a new upload
export const FileUploadsContext = createContext<null | FileUploadsContextValue>(
  null,
);

export type FileUploadsProgress = {
  [requestId: string]: number;
};

// A separate context for granular upload progress so that components that don't care about it aren't affected by it
export const FileUploadProgressContext = createContext<
  FileUploadsProgress | undefined
>(undefined);

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
