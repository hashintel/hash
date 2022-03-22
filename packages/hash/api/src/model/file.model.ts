import { ApolloError } from "apollo-server-express";
import { PresignedPost } from "@aws-sdk/s3-presigned-post";
import { DbClient } from "../db";
import { CreateEntityArgs, Entity, EntityConstructorArgs, File } from ".";
import { createEntityArgsBuilder, genId } from "../util";

import { DbFileProperties, EntityType } from "../db/adapter";
import { StorageType } from "../graphql/apiTypes.gen";
import {
  getStorageProvider,
  getUploadStorageProvider,
} from "../storage/storage-provider-lookup";

const MAX_FILE_SIZE_BYTES = 1000 * 1000 * 1000;

const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

export type FileConstructorArgs = {
  properties: DbFileProperties;
} & EntityConstructorArgs;

export type CreateFileArgs = {
  properties: DbFileProperties;
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
  properties: DbFileProperties;

  constructor(args: FileConstructorArgs) {
    super(args);
    this.properties = args.properties;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const fileEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "File",
    });
    return fileEntityType;
  }

  static async createFile(
    client: DbClient,
    params: CreateFileArgs,
  ): Promise<File> {
    const dbEntity = await client.createEntity(params);
    return new File(dbEntity);
  }

  static async getFileDownloadURL(
    usedStorage: StorageType,
    params: { key: string },
  ): Promise<string> {
    return await getStorageProvider(usedStorage).presignDownload({
      ...params,
      expiresInSeconds: DOWNLOAD_URL_EXPIRATION_SECONDS,
    });
  }

  /** Creation of a file entity with no file upload, instead
   * setting its storage to `EXTERNAL_LINK` and keeping the link in the `key` property.
   */
  static async createFileEntityFromLink(
    client: DbClient,
    params: CreateFileFromLinkArgs,
  ): Promise<File> {
    const { name, accountId, url, createdByAccountId } = params;
    // We set the `key` of the file to be the URL for external links
    // The external file storage will know to use the key to retrieve the url.
    const key = url;
    try {
      const properties: DbFileProperties = {
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
    client: DbClient,
    params: CreateUploadRequestArgs,
  ): Promise<CreateUploadRequestFileResponse> {
    const { name, contentMd5, accountId, size } = params;
    const storage = getUploadStorageProvider();
    const entityVersionId = genId();
    const key = storage.getFileEntityStorageKey({
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
      const properties: DbFileProperties = {
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
}

export default __File;
