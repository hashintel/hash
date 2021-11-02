import { ApolloError } from "apollo-server-express";
import { PresignedPost } from "@aws-sdk/s3-presigned-post";
import { DBClient } from "../db";
import { CreateEntityArgs, Entity, EntityConstructorArgs, File } from ".";
import { genId } from "../util";
import { getFileEntityKey, presignS3FileUpload } from "../storage/s3";
import { createEntityArgsBuilder } from "../graphql/resolvers/util";
import { DBFileProperties } from "../db/adapter";

const MAX_FILE_SIZE_BYTES = 1000 * 1000 * 1000;

export type FileConstructorArgs = {
  properties: DBFileProperties;
} & EntityConstructorArgs;

export type CreateFileArgs = {
  properties: DBFileProperties;
  entityVersionId: string;
} & CreateEntityArgs;

export type CreateUploadRequestArgs = {
  name: string;
  contentMd5: string;
  size: number;
  accountId: string;
};

export interface CreateUploadRequestFileResponse {
  presignedPost: PresignedPost;
  file: File;
}

class __File extends Entity {
  properties: DBFileProperties;

  constructor(args: FileConstructorArgs) {
    super(args);
    this.properties = args.properties;
  }

  static createFile =
    (client: DBClient) =>
    async (args: CreateFileArgs): Promise<File> => {
      const entity = await client.createEntity(args);
      return new File(entity);
    };

  static createFileEntityFromUploadRequest =
    (client: DBClient) =>
    async ({
      name,
      contentMd5,
      size,
      accountId,
    }: CreateUploadRequestArgs): Promise<CreateUploadRequestFileResponse> => {
      const entityVersionId = genId();
      const key = getFileEntityKey({
        accountId,
        entityVersionId,
        fileName: name,
      });
      if (size > MAX_FILE_SIZE_BYTES) {
        throw new ApolloError(
          "The file is heavier than the maximum allowed file size",
          "MAX_FILE_SIZE_EXCEEDED",
        );
      }
      try {
        const presignedPost = await presignS3FileUpload({
          accountId,
          fileName: name,
          contentMd5,
          entityVersionId,
        });
        const properties: DBFileProperties = {
          name,
          contentMd5,
          size,
          key,
          // Not used yet, should be used eventually
          mediaType: "",
        };
        const entityArgs = createEntityArgsBuilder({
          accountId,
          createdById: accountId,
          systemTypeName: "File",
          versioned: true,
          properties,
          entityVersionId,
        }) as CreateFileArgs;
        const fileEntity = await File.createFile(client)(entityArgs);
        return {
          presignedPost,
          file: fileEntity,
        };
      } catch (error) {
        throw new ApolloError(
          `There was an error requesting the file upload: ${error}`,
          "INTERNAL_SERVER_ERROR",
        );
      }
    };
}

export default __File;
