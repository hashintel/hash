import { getRequiredEnv } from "../util";

export const getAwsRegion = (): string => getRequiredEnv("AWS_REGION");

export const getAwsS3Config = () => {
  return {
    bucket: getRequiredEnv("AWS_S3_UPLOADS_BUCKET"),
    region: process.env.AWS_S3_REGION ?? getAwsRegion(),
  };
};
