import type { VersionedUrl } from "@blockprotocol/type-system";
import type { PresignedPutUpload } from "@local/hash-backend-utils/file-storage";
import { getEntityTypeIdForMimeType } from "@local/hash-backend-utils/file-storage";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  File,
  FileProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity } from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import mime from "mime-types";

import type {
  MutationCreateFileFromUrlArgs,
  MutationRequestFileUploadArgs,
} from "../../../graphql/api-types.gen";
import type { AuthenticationContext } from "../../../graphql/authentication-context";
import { genId } from "../../../util";
import type {
  ImpureGraphContext,
  ImpureGraphFunction,
} from "../../context-types";
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
  ctx: ImpureGraphContext<false, true>,
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
    const { entityTypeId: specifiedEntityTypeId } = fileEntityCreationInput;

    const entityTypeIdByMimeType = getEntityTypeIdForMimeType(mimeType);

    let entityTypeId: VersionedUrl;

    if (specifiedEntityTypeId) {
      const isHashEntityType = specifiedEntityTypeId.startsWith(
        "https://hash.ai/@hash/",
      );

      if (isHashEntityType) {
        /**
         * If the entity type ID is from a HASH entity type, and
         * if there is a mime entity type ID and it is not the same
         * as the specified entity type ID, override it. Otherwise,
         * use the specified entity type ID.
         *
         * @todo when not using the specified entity ID, consider
         * ensuring that the mime entity type ID is a sub-type of
         * the specified type ID
         */
        entityTypeId =
          entityTypeIdByMimeType &&
          specifiedEntityTypeId !== entityTypeIdByMimeType
            ? entityTypeIdByMimeType
            : specifiedEntityTypeId;
      } else {
        /**
         * If the specified entity type ID is not a hash entity type,
         * we use it directly.
         */
        entityTypeId = specifiedEntityTypeId;
      }
    } else {
      /**
       * If no entity type ID was specified, we use the mime entity type ID
       * directly if it exists, otherwise we use the default `File` entity.
       */
      entityTypeId =
        entityTypeIdByMimeType ?? systemEntityTypes.file.entityTypeId;
    }

    return {
      existingEntity: null,
      entityTypeId,
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
  Promise<{
    presignedPut: PresignedPutUpload;
    entity: Entity<FileProperties>;
  }>,
  true,
  true
> = async (ctx, authentication, params) => {
  const { uploadProvider } = ctx;
  const { description, displayName, name, size } = params;

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, name);

  const initialProperties: FileProperties = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      description ?? undefined,
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
      "https://placehold.co/600x400?text=PLACEHOLDER",
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
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/":
      size,
  };

  let fileEntity = existingEntity;
  if (!fileEntity) {
    fileEntity = (await createEntity(ctx, authentication, {
      ownedById,
      properties: initialProperties,
      entityTypeId,
      relationships: createDefaultAuthorizationRelationships(authentication),
    })) as Entity<FileProperties>;
  }

  const editionIdentifier = genId();

  const key = uploadProvider.getFileEntityStorageKey({
    entityId: fileEntity.metadata.recordId.entityId,
    editionIdentifier,
    filename: name,
  });

  try {
    const { fileStorageProperties, presignedPut } =
      await uploadProvider.presignUpload({
        key,
        headers: {
          "content-length": size,
          "content-type": mimeType,
        },
        expiresInSeconds: UPLOAD_URL_EXPIRATION_SECONDS,
      });

    const properties: FileProperties = {
      ...initialProperties,
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        formatUrl(key),
      ...fileStorageProperties,
    };

    const entity = (await updateEntity(ctx, authentication, {
      entity: fileEntity,
      entityTypeId,
      properties,
    })) as Entity<FileProperties>;

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
  Promise<File>,
  false,
  true
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
          relationships:
            createDefaultAuthorizationRelationships(authentication),
        })) as unknown as File);
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
