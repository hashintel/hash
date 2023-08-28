import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { blockProtocolTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  RemoteFile,
  RemoteFileProperties,
} from "@local/hash-isomorphic-utils/system-types/blockprotocol/file";
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
  Promise<{ presignedPost: PresignedPostUpload; entity: RemoteFile }>
> = async (ctx, params) => {
  // @todo we have the size available here -- we could use it for size limitations. can the presigned POST URL also validate size?

  const { uploadProvider } = ctx;
  const { ownedById, actorId, description, entityTypeId, name } = params;

  const fileIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    accountId: ownedById,
    uniqueIdentifier: fileIdentifier,
  });

  const fileEntityTypeId =
    // @todo validate that entityTypeId, if provided, ultimately inherits from RemoteFile
    entityTypeId || blockProtocolTypes["remote-file"].entityTypeId;

  try {
    // We don't have the file and so don't have its own name or mimetype
    const properties: Partial<RemoteFileProperties> = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        formatUrl(key),
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        name ?? undefined,
    };

    const entity = (await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: fileEntityTypeId,
      actorId,
    })) as unknown as RemoteFile;

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
  Promise<RemoteFile>
> = async (ctx, params) => {
  const { ownedById, actorId, description, entityTypeId, url } = params;

  const filename = params.name || url.split("/").pop()!;
  const mimeType = mime.lookup(filename) || "application/octet-stream";

  const fileEntityTypeId =
    // @todo validate that entityTypeId, if provided, ultimately inherits from RemoteFile
    entityTypeId || blockProtocolTypes["remote-file"].entityTypeId;

  try {
    const properties: RemoteFileProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        url,
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        mimeType,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        filename,
    };

    const entity = (await createEntity(ctx, {
      ownedById,
      properties,
      entityTypeId: fileEntityTypeId,
      actorId,
    })) as unknown as RemoteFile;

    return entity;
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
