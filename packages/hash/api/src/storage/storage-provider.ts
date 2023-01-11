import { AccountId } from "@hashintel/hash-shared/types";
import { DataSource } from "apollo-datasource";

export enum StorageType {
  AwsS3 = "AWS_S3",
  ExternalLink = "EXTERNAL_LINK",
  LocalFileSystem = "LOCAL_FILE_SYSTEM",
}

/** Interface describing a generic storage provider
 * used for allowing the download and upload files via presigned request.
 * The storage provider doesn't upload the file itself, instead it returns a URL
 * and form-data fields for the client to upload their file to.
 */
export interface StorageProvider {
  storageType: StorageType;
  /** Presigns a file download request for a client to later download a file
   * @return {string} The download URL to access the file
   */
  presignDownload(params: PresignedDownloadRequest): Promise<string>;
}

export interface GetFileEntityStorageKeyParams {
  accountId: AccountId;
  uniqueIdenitifier: string;
}

export interface UploadableStorageProvider extends StorageProvider, DataSource {
  /** Presigns a file upload request for a client to later upload a file
   * @return {Promise<PresignedPostUpload>} Object containing the data and url needed to POST the file
   */
  presignUpload(params: PresignedStorageRequest): Promise<PresignedPostUpload>;
  /** For a given file upload request, generates the path/key to store the file. This method
   * needs to be defined by each storage provider, as different storage providers might want to store files in different paths
   */
  getFileEntityStorageKey(params: GetFileEntityStorageKeyParams): string;
}

/** Parameters needed to allow the storage of a file */
export interface PresignedStorageRequest {
  /** Key (or path) of the file in the storage */
  key: string;
  /** Custom parameter fields to add to the storage request (currently used by S3) */
  fields: {
    [key: string]: string;
  };
  /** Expiry delay for the upload authorisation. The client needs to upload a file before that time */
  expiresInSeconds: number;
}

/** Parameters needed to allow the download of a stored file */
export interface PresignedDownloadRequest {
  /** Key or path of the file in the storage */
  key: string;
  /** Expiry delay for the download authorisation */
  expiresInSeconds: number;
}

/** Data returned for a client
 * to be able to send a POST request to upload a file */
export interface PresignedPostUpload {
  /** URL to send the upload request to */
  url: string;
  /** form-data fields that must be appended to the POST data
   * when uploading the file */
  fields: {
    [key: string]: string;
  };
}

/** Helper type to create a typed "dictionary" of storage types to their storage provider instance */
export type StorageProviderLookup = Partial<
  Record<StorageType, StorageProvider | UploadableStorageProvider>
>;
