import { apiOrigin } from "@hashintel/hash-shared/environment";
import { Entity, PropertyObject } from "@hashintel/hash-subgraph";

import { EntityTypeMismatchError } from "../../../lib/error";
import { PresignedPostUpload } from "../../../storage";
import { genId } from "../../../util";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { createEntity, CreateEntityParams } from "../primitive/entity";

// 1800 seconds
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
  fileUrl: string;
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

  const fileUrl = entity.properties[
    SYSTEM_TYPES.propertyType.fileUrl.metadata.editionId.baseId
  ] as string;

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
    fileUrl,
    fileMediaType,
    fileKey,
  };
};

export const formatUrl = (key: string) => {
  return `${apiOrigin}/file/${key}`;
};

export const createFileFromUploadRequest: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    size: number;
    mediaType: string;
  },
  Promise<{ presignedPost: PresignedPostUpload; entity: Entity }>
> = async (
  ctx,
  params,
): Promise<{ presignedPost: PresignedPostUpload; entity: Entity }> => {
  const { uploadProvider } = ctx;
  const { ownedById, actorId, mediaType } = params;

  const fileIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    accountId: ownedById,
    uniqueIdenitifier: fileIdentifier,
  });

  try {
    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.fileUrl.metadata.editionId.baseId]:
        formatUrl(key),
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
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    url: string;
    mediaType: string;
  },
  Promise<Entity>
> = async (ctx, params): Promise<Entity> => {
  const { ownedById, actorId, mediaType, url } = params;

  const key = url;

  try {
    const properties: PropertyObject = {
      // When a file is an external link, we simply use the key as the fileUrl.
      [SYSTEM_TYPES.propertyType.fileUrl.metadata.editionId.baseId]: key,
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
