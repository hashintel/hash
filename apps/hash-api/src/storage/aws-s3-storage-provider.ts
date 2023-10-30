import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedPutUpload,
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
  public storageType: StorageType = StorageType.AwsS3;

  constructor({
    bucket,
    credentials,
    region,
  }: AwsS3StorageProviderConstructorArgs) {
    // optional environment variable if using a non-AWS S3 compatible service
    const bucketEndpoint = process.env.AWS_S3_UPLOADS_ENDPOINT;

    this.bucket = bucket;
    this.client = new S3Client({
      endpoint: bucketEndpoint,
      credentials,
      forcePathStyle: process.env.AWS_S3_UPLOADS_FORCE_PATH_STYLE === "true",
      region,
    });
  }

  async presignUpload(
    params: PresignedStorageRequest,
  ): Promise<PresignedPutUpload> {
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
      url: presignedPutUrl,
    };
  }

  async presignDownload(params: PresignedDownloadRequest): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
    });
    return url;
  }

  getFileEntityStorageKey({
    ownedById,
    editionIdentifier,
    filename,
  }: GetFileEntityStorageKeyParams) {
    return `files/${ownedById}/${editionIdentifier}/${filename}`;
  }
}
