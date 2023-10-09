import { AwsS3StorageProviderConstructorArgs } from "../storage";
import { getRequiredEnv } from "../util";

export const getAwsRegion = (): string => getRequiredEnv("AWS_REGION");

export const getAwsS3Config = (): AwsS3StorageProviderConstructorArgs => {
  return {
    credentials: {
      accessKeyId: getRequiredEnv("AWS_S3_UPLOADS_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("AWS_S3_UPLOADS_SECRET_ACCESS_KEY"),
    },
    bucket: getRequiredEnv("AWS_S3_UPLOADS_BUCKET"),
    region: process.env.AWS_S3_REGION ?? getAwsRegion(),
  };
};
