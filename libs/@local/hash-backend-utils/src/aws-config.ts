import { getRequiredEnv } from "./environment.js";
import type { AwsS3StorageProviderConstructorArgs } from "./file-storage/aws-s3-storage-provider.js";

export const getAwsRegion = (): string => getRequiredEnv("AWS_REGION");

export const getAwsS3Config = (): AwsS3StorageProviderConstructorArgs => {
  return {
    credentials: process.env.AWS_S3_UPLOADS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_S3_UPLOADS_ACCESS_KEY_ID,
          secretAccessKey: getRequiredEnv("AWS_S3_UPLOADS_SECRET_ACCESS_KEY"),
        }
      : undefined, // authorization may be provided by other means, e.g. IAM role for API task
    bucket: getRequiredEnv("AWS_S3_UPLOADS_BUCKET"),
    region: process.env.AWS_S3_REGION ?? getAwsRegion(),
  };
};
