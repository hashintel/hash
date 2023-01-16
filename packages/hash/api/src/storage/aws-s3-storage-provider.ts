import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedPostUpload,
  PresignedStorageRequest,
  StorageType,
  UploadableStorageProvider,
} from "./storage-provider";

export interface AwsS3StorageProviderConstructorArgs {
  /** Name of the S3 bucket */
  bucket: string;
  /** S3 region */
  region: string;
}
/** Inplementation of the storage provider for AWS S3. Uploads all files to a single bucket */
export class AwsS3StorageProvider implements UploadableStorageProvider {
  /** The S3 client is created in the constructor and kept as long as the instance lives */
  private client: S3Client;
  private bucket: string;
  public storageType: StorageType = StorageType.AwsS3;

  constructor({ bucket, region }: AwsS3StorageProviderConstructorArgs) {
    this.bucket = bucket;
    this.client = new S3Client({ region });
  }

  async presignUpload(
    params: PresignedStorageRequest,
  ): Promise<PresignedPostUpload> {
    const presignedPost = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: params.key,
      Fields: params.fields,
      Expires: params.expiresInSeconds,
    });
    return presignedPost;
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
    accountId,
    uniqueIdenitifier,
  }: GetFileEntityStorageKeyParams) {
    return `files/${accountId}/${uniqueIdenitifier}`;
  }
}
