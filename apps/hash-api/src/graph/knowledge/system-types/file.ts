import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  File,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/file";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import mime from "mime-types";

import {
  MutationCreateFileFromUrlArgs,
  MutationRequestFileUploadArgs,
} from "../../../graphql/api-types.gen";
import { AuthenticationContext } from "../../../graphql/context";
import { PresignedPutUpload } from "../../../storage";
import { genId } from "../../../util";
import { ImpureGraphContext, ImpureGraphFunction } from "../..";
import {
  createEntity,
  getLatestEntityById,
  updateEntity,
} from "../primitive/entity";

// 1800 seconds
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 30;

export const formatUrl = (key: string) => {
  return `${apiOrigin}/file/${key}`;
};

const generateCommonParameters = async (
  ctx: ImpureGraphContext,
  authentication: AuthenticationContext,
  entityInput: Pick<
    MutationRequestFileUploadArgs | MutationCreateFileFromUrlArgs,
    "fileEntityCreationInput" | "fileEntityUpdateInput"
  >,
  filename: string,
) => {
  const mimeType = mime.lookup(filename) || "application/octet-stream";

  const { fileEntityCreationInput, fileEntityUpdateInput } = entityInput;
  if (fileEntityUpdateInput && fileEntityCreationInput) {
    throw new Error(
      "You must provide exactly one of fileEntityCreationInput or fileEntityUpdateInput, not both",
    );
  }

  if (fileEntityUpdateInput) {
    const existingEntity = await getLatestEntityById(ctx, authentication, {
      entityId: fileEntityUpdateInput.existingFileEntityId,
    });

    return {
      existingEntity,
      entityTypeId:
        fileEntityUpdateInput.entityTypeId ??
        existingEntity.metadata.entityTypeId,
      mimeType,
      ownedById: extractOwnedByIdFromEntityId(
        existingEntity.metadata.recordId.entityId,
      ),
    };
  } else if (fileEntityCreationInput) {
    return {
      existingEntity: null,
      entityTypeId:
        fileEntityCreationInput.entityTypeId ?? mimeType.startsWith("image/")
          ? systemTypes.entityType.imageFile.entityTypeId
          : systemTypes.entityType.file.entityTypeId,
      mimeType,
      ownedById: fileEntityCreationInput.ownedById,
    };
  }

  throw new Error(
    "One of fileEntityCreationInput or fileEntityUpdateInput must be provided",
  );
};

export const createFileFromUploadRequest: ImpureGraphFunction<
  MutationRequestFileUploadArgs,
  Promise<{ presignedPut: PresignedPutUpload; entity: File }>
> = async (ctx, authentication, params) => {
  const { uploadProvider } = ctx;
  const { description, displayName, name, size } = params;

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, name);

  const editionIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    ownedById,
    editionIdentifier,
    filename: name,
  });

  try {
    const properties: FileProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        formatUrl(key),
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        name,
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        displayName ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        mimeType,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
        name,
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
        "Upload",
    };

    const presignedPut = await uploadProvider.presignUpload({
      key,
      headers: {
        "content-length": size,
        "content-type": mimeType,
      },
      expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
    });

    const entity = existingEntity
      ? ((await updateEntity(ctx, authentication, {
          entity: existingEntity,
          entityTypeId,
          properties,
        })) as unknown as File)
      : ((await createEntity(ctx, authentication, {
          ownedById,
          properties,
          entityTypeId,
        })) as unknown as File);

    return {
      presignedPut,
      entity,
    };
  } catch (error) {
    throw new Error(`There was an error requesting the file upload: ${error}`);
  }
};

export const createFileFromExternalUrl: ImpureGraphFunction<
  MutationCreateFileFromUrlArgs,
  Promise<File>
> = async (ctx, authentication, params) => {
  const { description, displayName, url } = params;

  const filename = url.split("/").pop()!;

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, filename);

  try {
    const properties: FileProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        description ?? undefined,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        filename,
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        displayName ?? undefined,
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

    return existingEntity
      ? ((await updateEntity(ctx, authentication, {
          entity: existingEntity,
          entityTypeId,
          properties,
        })) as unknown as File)
      : ((await createEntity(ctx, authentication, {
          ownedById,
          properties,
          entityTypeId,
        })) as unknown as File);
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
