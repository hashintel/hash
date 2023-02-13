import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { Entity, EntityPropertiesObject } from "@local/hash-subgraph/main";

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
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.block.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const fileUrl = entity.properties[
    SYSTEM_TYPES.propertyType.fileUrl.metadata.recordId.baseUri
  ] as string;

  const fileMediaType = entity.properties[
    SYSTEM_TYPES.propertyType.fileMediaType.metadata.recordId.baseUri
  ] as string;

  const fileKeyObject = entity.properties[
    SYSTEM_TYPES.propertyType.fileKey.metadata.recordId.baseUri
  ] as Record<string, any>;

  const fileKey: FileKey =
    SYSTEM_TYPES.propertyType.externalFileUrl.metadata.recordId.baseUri in
    fileKeyObject
      ? {
          type: "ExternalFileLink",
          externalFileLink: fileKeyObject[
            SYSTEM_TYPES.propertyType.externalFileUrl.metadata.recordId.baseUri
          ] as string,
        }
      : {
          type: "ObjectStoreKey",
          objectStoreKey: fileKeyObject[
            SYSTEM_TYPES.propertyType.objectStoreKey.metadata.recordId.baseUri
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
    const properties: EntityPropertiesObject = {
      [SYSTEM_TYPES.propertyType.fileUrl.metadata.recordId.baseUri]:
        formatUrl(key),
      [SYSTEM_TYPES.propertyType.fileMediaType.metadata.recordId.baseUri]:
        mediaType,
      [SYSTEM_TYPES.propertyType.fileKey.metadata.recordId.baseUri]: {
        [SYSTEM_TYPES.propertyType.objectStoreKey.metadata.recordId.baseUri]:
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

export const createFileFromExternalUrl: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    url: string;
    mediaType: string;
  },
  Promise<Entity>
> = async (ctx, params): Promise<Entity> => {
  const { ownedById, actorId, mediaType, url } = params;

  const key = url;

  try {
    const properties: EntityPropertiesObject = {
      // When a file is an external link, we simply use the key as the fileUrl.
      [SYSTEM_TYPES.propertyType.fileUrl.metadata.recordId.baseUri]: key,
      [SYSTEM_TYPES.propertyType.fileMediaType.metadata.recordId.baseUri]:
        mediaType,
      [SYSTEM_TYPES.propertyType.fileKey.metadata.recordId.baseUri]: {
        [SYSTEM_TYPES.propertyType.externalFileUrl.metadata.recordId.baseUri]:
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
