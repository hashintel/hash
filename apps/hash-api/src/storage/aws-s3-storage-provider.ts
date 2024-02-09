import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedStorageRequest,
  StorageType,
  UploadableStorageProvider,
} from "./storage-provider";

export interface AwsS3StorageProviderConstructorArgs {
  credentials: S3ClientConfig["credentials"];
  /** Name of the S3 bucket */
  bucket: string;
  /** S3 region */
  region: string;
}
/** Implementation of the storage provider for AWS S3. Uploads all files to a single bucket */
export class AwsS3StorageProvider implements UploadableStorageProvider {
  /** The S3 client is created in the constructor and kept as long as the instance lives */
  private client: S3Client;
  private bucket: string;
  private endpoint?: string;
  private forcePathStyle?: boolean;
  private region: string;
  public storageType: StorageType = "AWS_S3";

  constructor({
    bucket,
    credentials,
    region,
  }: AwsS3StorageProviderConstructorArgs) {
    // optional environment variable if using a non-AWS S3 compatible service
    const bucketEndpoint = process.env.AWS_S3_UPLOADS_ENDPOINT;

    this.bucket = bucket;
    this.endpoint = bucketEndpoint;
    this.forcePathStyle =
      process.env.AWS_S3_UPLOADS_FORCE_PATH_STYLE === "true";
    this.region = region;

    /**
     * Configure the default client for file uploads and downloads
     * Previously uploaded entities may have different configs saved which will be applied on download
     */
    this.client = new S3Client({
      endpoint: bucketEndpoint,
      credentials,
      // Use path-style rather than virtual host-style for requests, required by some S3-compatible services
      forcePathStyle: process.env.AWS_S3_UPLOADS_FORCE_PATH_STYLE === "true",
      region,
    });
  }

  async presignUpload(params: PresignedStorageRequest) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentLength: params.headers?.["content-length"],
      ContentType: params.headers?.["content-type"],
      Key: params.key,
    });

    const presignedPutUrl = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
      signableHeaders: new Set(["content-length", "content-type"]),
    });

    return {
      fileStorageProperties: {
        bucket: this.bucket,
        endpoint: this.endpoint,
        forcePathStyle: this.forcePathStyle,
        key: params.key,
        provider: "AWS_S3" as const,
        region: this.region,
      },
      presignedPut: { url: presignedPutUrl },
    };
  }

  async presignDownload(params: PresignedDownloadRequest): Promise<string> {
    const { key, entity } = params;
    const {
      fileStorageBucket,
      fileStorageEndpoint,
      fileStorageRegion,
      fileStorageForcePathStyle,
    } = simplifyProperties(entity.properties);

    let client = this.client;

    if (
      fileStorageBucket !== this.bucket ||
      fileStorageEndpoint !== this.endpoint ||
      fileStorageForcePathStyle !== this.forcePathStyle ||
      fileStorageRegion !== this.region
    ) {
      /**
       * We store the exact configuration used when the file was uploaded,
       * in case it's different to the current configuration.
       *
       * If the credentials in effect are invalid for the saved configuration,
       * the request will fail.
       * @todo allow specifying different credentials for access based on the storage configuration
       */
      client = new S3Client({
        credentials: this.client.config.credentials,
        endpoint: fileStorageEndpoint,
        forcePathStyle: fileStorageForcePathStyle,
        region: fileStorageRegion,
      });
    }

    const command = new GetObjectCommand({
      Bucket: fileStorageBucket,
      Key: key,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: params.expiresInSeconds,
    });
    return url;
  }

  getFileEntityStorageKey({
    entityId,
    editionIdentifier,
    filename,
  }: GetFileEntityStorageKeyParams) {
    return `files/${entityId}/${editionIdentifier}/${filename}` as const;
  }
}
