import { ApolloError } from "apollo-server-express";
import { PresignedPost } from "@aws-sdk/s3-presigned-post";
import { DBClient } from "../db";
import { CreateEntityArgs, Entity, EntityConstructorArgs, File } from ".";
import { genId } from "../util";
import { createEntityArgsBuilder } from "../graphql/resolvers/util";
import { DBFileProperties, EntityType } from "../db/adapter";
import {
  StorageProvider,
  UploadableStorageProvider,
} from "../storage/storage-provider";
import { StorageType } from "../graphql/apiTypes.gen";

const MAX_FILE_SIZE_BYTES = 1000 * 1000 * 1000;
const FILE_EXTENSION_REGEX = /\.[0-9a-z]+$/i;
const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

export type FileConstructorArgs = {
  properties: DBFileProperties;
} & EntityConstructorArgs;

export type CreateFileArgs = {
  properties: DBFileProperties;
  entityVersionId?: string;
} & CreateEntityArgs;

export type CreateUploadRequestArgs = {
  name: string;
  contentMd5: string;
  size: number;
  accountId: string;
};

export type CreateFileFromLinkArgs = {
  name: string;
  accountId: string;
  createdByAccountId: string;
  url: string;
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

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const fileEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "File",
    });
    return fileEntityType;
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

  /** Creation of a file entity with no file upload, instead
   * setting its storage to `EXTERNAL_LINK` and keeping the link in the `key` property.
   */
  static async createFileEntityFromLink(
    client: DBClient,
    params: CreateFileFromLinkArgs,
  ): Promise<File> {
    const { name, accountId, url, createdByAccountId } = params;
    // We set the `key` of the file to be the URL for external links
    // The external file storage will know to use the key to retrieve the url.
    const key = url;
    try {
      const properties: DBFileProperties = {
        name,
        size: 0,
        key,
        /** @todo: Not used yet, should be used eventually */
        mediaType: "",
        storageType: StorageType.ExternalLink,
      };
      const entityArgs = createEntityArgsBuilder({
        accountId,
        createdByAccountId,
        systemTypeName: "File",
        versioned: true,
        properties,
      }) as CreateFileArgs;
      const fileEntity = await File.createFile(client, entityArgs);
      return fileEntity;
    } catch (error) {
      throw new ApolloError(
        `There was an error creating the file entity from a link: ${error}`,
        "INTERNAL_SERVER_ERROR",
      );
    }
  }

  static async createFileEntityFromUploadRequest(
    client: DBClient,
    storage: UploadableStorageProvider,
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
        storageType: storage.storageType,
      };
      const entityArgs = createEntityArgsBuilder({
        accountId,
        createdByAccountId: accountId,
        systemTypeName: "File",
        versioned: true,
        properties,
        entityVersionId,
      });
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
