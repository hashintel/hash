import mime from "mime-types";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {   formatFileUrl,
  getEntityTypeIdForMimeType,
PresignedPutUpload ,
} from "@local/hash-backend-utils/file-storage";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { normalizeWhitespace } from "@local/hash-isomorphic-utils/normalize";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import type {
  MutationCreateFileFromUrlArgs,
  MutationRequestFileUploadArgs,
} from "../../../graphql/api-types.gen";
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
    const existingEntity = (await getLatestEntityById(ctx, authentication, {
      entityId: fileEntityUpdateInput.existingFileEntityId,
    })) as Entity<File>;

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
  } if (fileEntityCreationInput) {
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
         * @todo When not using the specified entity ID, consider
         * ensuring that the mime entity type ID is a sub-type of
         * the specified type ID.
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
    entity: Entity<File>;
  }>,
  true,
  true
> = async (ctx, authentication, params) => {
  const { uploadProvider } = ctx;
  const { description, displayName, name: unnormalizedFilename, size } = params;

  const name = normalizeWhitespace(unnormalizedFilename);

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, name);

  const initialProperties: File["propertiesWithMetadata"] = {
    value: {
      ...(description !== undefined && description !== null
        ? {
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              {
                value: description,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
          }
        : {}),
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
        {
          value: "https://placehold.co/600x400?text=PLACEHOLDER",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
        {
          value: name,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      ...(displayName !== undefined && displayName !== null
        ? {
            "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
              {
                value: displayName,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
          }
        : {}),
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
        {
          value: mimeType,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
        {
          value: name,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
        {
          value: "Upload",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/":
        {
          value: size,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
          },
        },
    },
  };

  let fileEntity = existingEntity;

  if (!fileEntity) {
    fileEntity = await createEntity<File>(ctx, authentication, {
      ownedById,
      properties: initialProperties,
      entityTypeId: entityTypeId as File["entityTypeId"],
      relationships: createDefaultAuthorizationRelationships(authentication),
    });
  }

  const editionIdentifier = generateUuid();

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

    const updatedProperties: File["propertiesWithMetadata"] = {
      ...fileStorageProperties,
      value: {
        ...fileStorageProperties.value,
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
          {
            value: formatFileUrl(key),
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
      },
    };

    const entity = await updateEntity<File>(ctx, authentication, {
      entity: fileEntity,
      entityTypeId,
      propertyPatches: typedEntries(updatedProperties.value).map(
        ([baseUrl, property]) => ({
          op: "add",
          path: [baseUrl as BaseUrl],
          property,
        }),
      ),
    });

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
  Promise<Entity<File>>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { description, displayName, url } = params;

  const filename = normalizeWhitespace(url.split("/").pop()!);

  const { entityTypeId, existingEntity, mimeType, ownedById } =
    await generateCommonParameters(ctx, authentication, params, filename);

  try {
    const properties: File["propertiesWithMetadata"] = {
      value: {
        ...(description !== undefined && description !== null
          ? {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
                {
                  value: description,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
            }
          : {}),
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
          {
            value: filename,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        ...(displayName !== undefined && displayName !== null
          ? {
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
                {
                  value: displayName,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
            }
          : {}),
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
          {
            value: url,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
          {
            value: mimeType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
          {
            value: filename,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
          {
            value: "URL",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/":
          {
            value: url,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
      },
    };

    return existingEntity
      ? await updateEntity<File>(ctx, authentication, {
          entity: existingEntity,
          entityTypeId,
          propertyPatches: typedEntries(properties.value)
            .filter(
              ([baseUrl, property]) =>
                existingEntity.properties[baseUrl] !== property.value,
            )
            .map(([baseUrl, property]) => ({
              op: existingEntity.properties[baseUrl] ? "replace" : "add",
              path: [baseUrl as BaseUrl],
              property,
            })),
        })
      : await createEntity(ctx, authentication, {
          ownedById,
          properties,
          entityTypeId: entityTypeId as File["entityTypeId"],
          relationships:
            createDefaultAuthorizationRelationships(authentication),
        });
  } catch (error) {
    throw new Error(
      `There was an error creating the file entity from a link: ${error}`,
    );
  }
};
