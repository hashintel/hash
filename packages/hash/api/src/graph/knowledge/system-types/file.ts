import { Entity, PropertyObject } from "@hashintel/hash-subgraph";

import { EntityTypeMismatchError } from "../../../lib/error";
import { PresignedPostUpload } from "../../../storage";
import { genId } from "../../../util";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { createEntity, CreateEntityParams } from "../primitive/entity";

const MAX_FILE_SIZE_BYTES = 1000 * 1000 * 1000;

// const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

export type FileKey =
  | {
      type: "ObjectStoreKey";
      objectStoreKey: string;
    }
  | {
      type: "ExternalFileLink";
      externalFileLink: string;
    };

export type File = {
  fileMediaType: string;
  fileKey: FileKey;
};

export const getFileFromEntity: PureGraphFunction<{ entity: Entity }, File> = ({
  entity,
}) => {
  if (
    entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.file.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.editionId.baseId,
      SYSTEM_TYPES.entityType.block.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const fileMediaType = entity.properties[
    SYSTEM_TYPES.propertyType.fileMediaType.metadata.editionId.baseId
  ] as string;

  const fileKeyObject = entity.properties[
    SYSTEM_TYPES.propertyType.fileKey.metadata.editionId.baseId
  ] as Record<string, any>;

  const fileKey: FileKey =
    SYSTEM_TYPES.propertyType.externalFileLink.metadata.editionId.baseId in
    fileKeyObject
      ? {
          type: "ExternalFileLink",
          externalFileLink: fileKeyObject[
            SYSTEM_TYPES.propertyType.externalFileLink.metadata.editionId.baseId
          ] as string,
        }
      : {
          type: "ObjectStoreKey",
          objectStoreKey: fileKeyObject[
            SYSTEM_TYPES.propertyType.objectStoreKey.metadata.editionId.baseId
          ] as string,
        };

  return {
    fileMediaType,
    fileKey,
  };
};

export const createFileFromUploadRequest: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityType"> & {
    size: number;
    mediaType: string;
  },
  Promise<{ presignedPost: PresignedPostUpload; entity: Entity }>
> = async (
  ctx,
  params,
): Promise<{ presignedPost: PresignedPostUpload; entity: Entity }> => {
  const { uploadProvider } = ctx;
  const { ownedById, actorId, mediaType, size } = params;

  /**
   * @todo we want the downstream upload services to enforce the given size
   * limit, otherwise the size limits are meaningless
   */
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error("The file is heavier than the maximum allowed file size");
  }

  const fileIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    accountId: ownedById,
    uniqueIdenitifier: fileIdentifier,
  });

  try {
    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.fileMediaType.metadata.editionId.baseId]:
        mediaType,
      [SYSTEM_TYPES.propertyType.fileKey.metadata.editionId.baseId]: {
        [SYSTEM_TYPES.propertyType.objectStoreKey.metadata.editionId.baseId]:
          key,
      },
    };

    const entity = await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: SYSTEM_TYPES.entityType.file.schema.$id,
      actorId,
    });

    const presignedPost = await uploadProvider.presignUpload({
      key,
      fields: {},
      expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
    });

    return {
      presignedPost,
      entity,
    };
  } catch (error) {
    throw new Error(`There was an error requesting the file upload: ${error}`);
  }
};

export const createFileFromExternalLink: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityType"> & {
    url: string;
    mediaType: string;
  },
  Promise<Entity>
> = async (ctx, params): Promise<Entity> => {
  const { ownedById, actorId, mediaType, url } = params;

  const key = url;

  try {
    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.fileMediaType.metadata.editionId.baseId]:
        mediaType,
      [SYSTEM_TYPES.propertyType.fileKey.metadata.editionId.baseId]: {
        [SYSTEM_TYPES.propertyType.externalFileLink.metadata.editionId.baseId]:
          key,
      },
    };

    const entity = await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: SYSTEM_TYPES.entityType.file.schema.$id,
      actorId,
    });

    return entity;
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
