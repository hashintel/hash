import { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity, EntityId } from "@local/hash-subgraph";
import { DataSource } from "apollo-datasource";

export const storageTypes = ["AWS_S3", "LOCAL_FILE_SYSTEM"] as const;
export type StorageType = (typeof storageTypes)[number];

export const isStorageType = (
  storageType: string,
): storageType is StorageType =>
  storageTypes.includes(storageType as StorageType);

/** Helper type to create a typed "dictionary" of storage types to their storage provider instance */
export type StorageProviderLookup = Partial<
  Record<StorageType, StorageProvider | UploadableStorageProvider>
>;

/**
 * All storage providers usable by the API should be added here.
 * Even if not currently used for upload, they need to be available for downloads.
 */
export const storageProviderLookup: StorageProviderLookup = {};

/** Interface describing a generic storage provider
 * used for allowing the download and upload files via presigned request.
 * The storage provider doesn't upload the file itself, instead it returns a URL
 * and form-data fields for the client to upload their file to.
 */
export interface StorageProvider {
  storageType: StorageType;
  /**
   * Presigns a file download request for a client to later download a file
   * @return {string} The download URL to access the file
   */
  presignDownload(params: PresignedDownloadRequest): Promise<string>;
}

export interface GetFileEntityStorageKeyParams {
  entityId: EntityId;
  editionIdentifier: string;
  filename: string;
}

export type FileStorageKey = `${
  | `${string}/` // optional path prefix
  | ""}${EntityId}/${string}/${string}`;

export interface UploadableStorageProvider extends StorageProvider, DataSource {
  /**
   * Presigns a file upload request for a client to later upload a file
   * @return Promise<Object> contains the presignedPut object with the url to PUT the file to, and the file storage configuration used
   */
  presignUpload(
    this: void,
    params: PresignedStorageRequest,
  ): Promise<{
    presignedPut: PresignedPutUpload;
    fileStorageProperties: {
      bucket?: string;
      endpoint?: string;
      forcePathStyle?: boolean;
      key: string;
      provider: StorageType;
      region?: string;
    };
  }>;
  /**
   * For a given file upload request, generates the path/key to store the file.
   * This method needs to be defined by each storage provider, as different storage providers might want to store files in different paths.
   * The key must reliably have the EntityId and edition timestamp as the 2nd and 3rd to last path segments, to identify the entity.
   */
  getFileEntityStorageKey(
    this: void,
    params: GetFileEntityStorageKeyParams,
  ): FileStorageKey;
}

/** Parameters needed to allow the storage of a file */
export interface PresignedStorageRequest {
  /** Key (or path) of the file in the storage */
  key: string;
  /** Headers to add to the storage request (currently used by S3-compatible storage providers) */
  headers?: {
    "content-type"?: string;
    "content-length"?: number;
  };
  /** Expiry delay for the upload authorisation. The client needs to upload a file before that time */
  expiresInSeconds: number;
}

/** Parameters needed to allow the download of a stored file */
export interface PresignedDownloadRequest {
  /** The file entity to provide a download URL for */
  entity: Entity<FileProperties>;
  /** File storage key * */
  key: string;
  /** Expiry delay for the download authorisation */
  expiresInSeconds: number;
}

/**
 * Data returned for a client to be able to send a PUT request to upload a file
 * PUT rather than POST is used for R2 compatibility
 * @see https://developers.cloudflare.com/r2/api/s3/presigned-urls
 */
export interface PresignedPutUpload {
  /** PUT URL to send the upload request to, including any headers */
  url: string;
}
