import type { S3ClientConfig } from "@aws-sdk/client-s3";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

import type {
  GetFileEntityStorageKeyParams,
  PresignedDownloadRequest,
  PresignedStorageRequest,
  StorageType,
  UploadableStorageProvider,
} from "../file-storage.js";

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

    const headers = Object.keys(params.headers ?? {});

    const presignedPutUrl = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
      signableHeaders: headers.length ? new Set(headers) : undefined,
    });

    return {
      fileStorageProperties: {
        value: {
          "https://hash.ai/@hash/types/property-type/file-storage-bucket/": {
            value: this.bucket,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          ...(this.endpoint
            ? {
                "https://hash.ai/@hash/types/property-type/file-storage-endpoint/":
                  {
                    value: this.endpoint,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    },
                  },
              }
            : {}),
          "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/":
            {
              value: !!this.forcePathStyle,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            },
          "https://hash.ai/@hash/types/property-type/file-storage-key/": {
            value: params.key,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/file-storage-provider/": {
            value: this.storageType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/file-storage-region/": {
            value: this.region,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        } satisfies Pick<
          File["propertiesWithMetadata"]["value"],
          | "https://hash.ai/@hash/types/property-type/file-storage-bucket/"
          | "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"
          | "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"
          | "https://hash.ai/@hash/types/property-type/file-storage-key/"
          | "https://hash.ai/@hash/types/property-type/file-storage-provider/"
          | "https://hash.ai/@hash/types/property-type/file-storage-region/"
        >,
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
