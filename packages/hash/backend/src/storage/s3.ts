import { createPresignedPost, PresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRequiredEnv } from "../util";

const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 15;
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;
// Can optionally specify a region for S3, default to our `AWS_REGION`
const AWS_REGION = process.env.AWS_S3_REGION || getRequiredEnv("AWS_REGION");
const S3_BUCKET = getRequiredEnv("AWS_S3_UPLOADS_BUCKET");
const FILE_EXTENSION_REGEX = /\.[0-9a-z]+$/i;

const Bucket = S3_BUCKET;
const client = new S3Client({ region: AWS_REGION });

export const getFileEntityKey = ({
  accountId,
  fileName,
  entityVersionId,
}: {
  accountId: string;
  fileName: string;
  entityVersionId: string;
}) => {
  // Using a `uuid` for the file key
  let fileKey = `files/${accountId}/${entityVersionId}`;
  // Find and add the file extension to the path if it exists
  const extension = fileName.match(FILE_EXTENSION_REGEX);
  if (extension) {
    fileKey += extension[0];
  }
  return fileKey;
};

export const presignS3FileUpload = async ({
  accountId,
  entityVersionId,
  fileName,
}: {
  accountId: string;
  entityVersionId: string;
  fileName: string;
  // Unused for now, but will be used soon for integrity check
  contentMd5: string;
}): Promise<PresignedPost> => {
  const Key = getFileEntityKey({ accountId, entityVersionId, fileName });
  const presignedPost = await createPresignedPost(client, {
    Bucket,
    Key,
    Fields: {},
    Expires: UPLOAD_URL_EXPIRATION_SECONDS,
  });
  return presignedPost;
};

export const presignS3FileDownload = async (Key: string) => {
  const command = new GetObjectCommand({
    Bucket,
    Key,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRATION_SECONDS,
  });
  return url;
};
