import type { EntityId, Url, VersionedUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

export const storageTypes = ["AWS_S3", "LOCAL_FILE_SYSTEM"] as const;
export type StorageType = (typeof storageTypes)[number];

export const isStorageType = (
  storageType: string,
): storageType is StorageType =>
  storageTypes.includes(storageType as StorageType);

/** Helper type to create a typed "dictionary" of storage types to their storage provider instance */
export type StorageProviderLookup = Partial<
  Record<StorageType, FileStorageProvider>
>;

/**
 * All storage providers usable by the API should be added here.
 * Even if not currently used for upload, they need to be available for downloads.
 */
export const storageProviderLookup: StorageProviderLookup = {};

export interface GetFileEntityStorageKeyParams {
  entityId: EntityId;
  editionIdentifier: string;
  filename: string;
}

export type FileStorageKey = `${
  | `${string}/` // optional path prefix
  | ""}${EntityId}/${string}/${string}`;

export interface GetFlowOutputStorageKeyParams {
  workflowId: string;
  runId: string;
  stepId: string;
  outputName: string;
}

/**
 * Interface describing a storage provider for file upload/download operations.
 * Supports both presigned URLs for client-side operations and direct access
 * for services with storage credentials.
 */
export interface FileStorageProvider {
  storageType: StorageType;

  /**
   * Presigns a file download request for a client to later download a file
   * @return {string} The download URL to access the file
   */
  presignDownload(params: PresignedDownloadRequest): Promise<Url>;

  /**
   * Presigns a file upload request for a client to later upload a file
   * @return Promise<Object> contains the presignedPut object with the url to PUT the file to, and the file storage
   *   configuration used
   */
  presignUpload(
    this: void,
    params: PresignedStorageRequest,
  ): Promise<{
    presignedPut: PresignedPutUpload;
    fileStorageProperties: Omit<File["propertiesWithMetadata"], "value"> & {
      value: Pick<
        File["propertiesWithMetadata"]["value"],
        | "https://hash.ai/@h/types/property-type/file-storage-bucket/"
        | "https://hash.ai/@h/types/property-type/file-storage-endpoint/"
        | "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"
        | "https://hash.ai/@h/types/property-type/file-storage-key/"
        | "https://hash.ai/@h/types/property-type/file-storage-provider/"
        | "https://hash.ai/@h/types/property-type/file-storage-region/"
      >;
    };
  }>;

  /**
   * For a given file upload request, generates the path/key to store the file.
   * This method needs to be defined by each storage provider, as different storage providers might want to store files
   * in different paths. The key must reliably have the EntityId and edition timestamp as the 2nd and 3rd to last path
   * segments, to identify the entity.
   */
  getFileEntityStorageKey(
    this: void,
    params: GetFileEntityStorageKeyParams,
  ): FileStorageKey;

  /**
   * Generate a storage key for flow output payloads.
   * Format: flows/{workflowId}/{runId}/{stepId}/{outputName}.json
   */
  getFlowOutputStorageKey(
    this: void,
    params: GetFlowOutputStorageKeyParams,
  ): string;

  /**
   * Upload data directly to storage without presigning.
   * Used by workers that have direct storage credentials.
   */
  uploadDirect(
    this: void,
    params: {
      key: string;
      body: string | Buffer;
      contentType?: string;
    },
  ): Promise<void>;

  /**
   * Download data directly from storage without presigning.
   * Used by workers that have direct storage credentials.
   */
  downloadDirect(this: void, params: { key: string }): Promise<Buffer>;
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
  entity: Pick<HashEntity<File>, "properties">;
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

const fileMimeTypeStartsWithToEntityTypeId: Record<string, VersionedUrl> = {
  "image/": systemEntityTypes.imageFile.entityTypeId,
  "application/pdf": systemEntityTypes.pdfDocument.entityTypeId,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    systemEntityTypes.docxDocument.entityTypeId,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    systemEntityTypes.pptxPresentation.entityTypeId,
};

export const getEntityTypeIdForMimeType = (mimeType: string) =>
  /**
   * @note we should to adapt this if we add sub-types for `Image` (for example a
   * `PNG Image` type), so that the most specific type is used.
   */
  Object.entries(fileMimeTypeStartsWithToEntityTypeId).find(
    ([mimeTypeStartsWith]) => mimeType.startsWith(mimeTypeStartsWith),
  )?.[1];

export const formatFileUrl = (key: string) => {
  return `${apiOrigin}/file/${key}`;
};
