import { Entity } from "@hashintel/hash-subgraph";

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
      fileSize: number;
    }
  | {
      type: "ExternalFileLink";
      externalFileLink: string;
    };

export type File = {
  fileName: string;
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

  const fileName = entity.properties[
    SYSTEM_TYPES.propertyType.fileName.metadata.editionId.baseId
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
          fileSize: fileKeyObject[
            SYSTEM_TYPES.propertyType.fileSize.metadata.editionId.baseId
          ] as number,
        };

  return {
    fileName,
    fileKey,
  };
};

export const createFileFromUploadRequest: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityType"> & {
    name: string;
    size: number;
    mediaType: string;
  },
  Promise<{ presignedPost: PresignedPostUpload; file: File }>
> = async (
  ctx,
  params,
): Promise<{ presignedPost: PresignedPostUpload; file: File }> => {
  const { storage } = ctx;
  const { ownedById, actorId, name, size } = params;

  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error("The file is heavier than the maximum allowed file size");
  }

  const fileIdentifier = genId();

  const key = storage.getFileEntityStorageKey({
    accountId: ownedById,
    fileName: name,
    uniqueIdenitifier: fileIdentifier,
  });

  try {
    const properties: File = {
      fileName: name,
      fileKey: { type: "ObjectStoreKey", fileSize: size, objectStoreKey: key },
    };

    const entity = await createEntity(ctx, {
      ownedById,
      properties,
      entityType: SYSTEM_TYPES.entityType.file,
      actorId,
    });

    const presignedPost = await storage.presignUpload({
      key,
      fields: {},
      expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
    });

    return {
      presignedPost,
      file: getFileFromEntity({ entity }),
    };
  } catch (error) {
    throw new Error(`There was an error requesting the file upload: ${error}`);
  }
};

// export const createFileFromExternalLink: ImpureGraphFunction<
//   Omit<CreateEntityParams, "properties" | "entityType"> & {
//     name: string;
//     size: number;
//     mediaType: string;
//   },
//   Promise<File>
// > = async (ctx, params): Promise<File> => {};
