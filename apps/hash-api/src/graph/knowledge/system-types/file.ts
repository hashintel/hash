import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  File,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/file";
import mime from "mime-types";

import {
  MutationCreateFileFromUrlArgs,
  MutationRequestFileUploadArgs,
} from "../../../graphql/api-types.gen";
import { PresignedPostUpload } from "../../../storage";
import { genId } from "../../../util";
import { ImpureGraphFunction } from "../..";
import { createEntity, CreateEntityParams } from "../primitive/entity";

// 1800 seconds
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

export const formatUrl = (key: string) => {
  return `${apiOrigin}/file/${key}`;
};

export const createFileFromUploadRequest: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> &
    MutationRequestFileUploadArgs,
  Promise<{ presignedPost: PresignedPostUpload; entity: File }>
> = async (ctx, params) => {
  // @todo we have the size available here -- we could use it for size limitations. can the presigned POST URL also validate size?

  const { uploadProvider } = ctx;
  const { ownedById, actorId, description, displayName, name, entityTypeId } =
    params;

  const fileEntityTypeId =
    // @todo validate that entityTypeId, if provided, ultimately inherits from File
    //    (or checks that it has at least the same properties)
    entityTypeId || types.entityType.file.entityTypeId;

  const mimeType = mime.lookup(name) || "application/octet-stream";
  const extension = mime.extension(mimeType);

  const fileIdentifier = `${genId()}.${extension}`;

  const key = uploadProvider.getFileEntityStorageKey({
    accountId: ownedById,
    uniqueIdentifier: fileIdentifier,
  });

  try {
    const properties: Partial<FileProperties> = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        formatUrl(key),
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        fileIdentifier,
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        displayName ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        mimeType,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
        name,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
        "Upload",
    };

    const entity = (await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: fileEntityTypeId,
      actorId,
    })) as unknown as File;

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
  Omit<CreateEntityParams, "properties" | "entityTypeId"> &
    MutationCreateFileFromUrlArgs,
  Promise<File>
> = async (ctx, params) => {
  const { ownedById, actorId, description, entityTypeId, url } = params;

  const filename = url.split("/").pop()!;
  const mimeType = mime.lookup(filename) || "application/octet-stream";

  const fileEntityTypeId =
    // @todo validate that entityTypeId, if provided, ultimately inherits from File
    //    (or checks that it has at least the same properties)
    entityTypeId || types.entityType.file.entityTypeId;

  try {
    const properties: FileProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        url,
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        mimeType,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
        filename,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
        "URL",
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/":
        url,
    };

    const entity = (await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: fileEntityTypeId,
      actorId,
    })) as unknown as File;

    return entity;
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
