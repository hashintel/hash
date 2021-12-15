import { getRequiredEnv } from "../util";

export const AWS_S3_BUCKET = getRequiredEnv("AWS_S3_UPLOADS_BUCKET");
export const AWS_REGION = getRequiredEnv("AWS_REGION");
export const AWS_S3_REGION = process.env.AWS_S3_REGION || AWS_REGION;
