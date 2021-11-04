import { ApolloError } from "apollo-server-express";
import { PresignedPost } from "@aws-sdk/s3-presigned-post";
import { DBClient } from "../db";
import { CreateEntityArgs, Entity, EntityConstructorArgs, File } from ".";
import { genId } from "../util";
import { createEntityArgsBuilder } from "../graphql/resolvers/util";
import { DBFileProperties } from "../db/adapter";
import { StorageProvider } from "../storage/storage-provider";

const MAX_FILE_SIZE_BYTES = 1000 * 1000 * 1000;
const FILE_EXTENSION_REGEX = /\.[0-9a-z]+$/i;
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 15;
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

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

  static async createFile(
    client: DBClient,
    params: CreateFileArgs,
  ): Promise<File> {
    const dbEntity = await client.createEntity(params);
    return new File(dbEntity);
  }

  static async getFileDownloadURL(
    storage: StorageProvider,
    params: { key: string },
  ): Promise<string> {
    return await storage.presignDownload({
      ...params,
      expiresInSeconds: DOWNLOAD_URL_EXPIRATION_SECONDS,
    });
  }

  static async createFileEntityFromUploadRequest(
    client: DBClient,
    storage: StorageProvider,
    params: CreateUploadRequestArgs,
  ): Promise<CreateUploadRequestFileResponse> {
    const { name, contentMd5, accountId, size } = params;

    const entityVersionId = genId();
    const key = File.getFileEntityStorageKey({
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
      const presignedPost = await storage.presignUpload({
        key,
        fields: {},
        expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
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
      const fileEntity = await File.createFile(client, entityArgs);
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
  }

  static getFileEntityStorageKey({
    accountId,
    fileName,
    entityVersionId,
  }: {
    accountId: string;
    fileName: string;
    entityVersionId: string;
  }) {
    let fileKey = `files/${accountId}/${entityVersionId}`;
    // Find and add the file extension to the path if it exists
    const extension = fileName.match(FILE_EXTENSION_REGEX);
    if (extension) {
      fileKey += extension[0];
    }
    return fileKey;
  }
}

export default __File;
