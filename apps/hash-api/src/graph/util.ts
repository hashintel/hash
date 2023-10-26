import {
  Array,
  DataTypeReference,
  ENTITY_TYPE_META_SCHEMA,
  EntityType,
  extractBaseUrl,
  Object as ObjectSchema,
  OneOf,
  PROPERTY_TYPE_META_SCHEMA,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  PrimitiveDataTypeKey,
  systemTypes,
} from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountGroupId,
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { DataSource } from "apollo-datasource";

import { AuthenticationContext } from "../graphql/context";
import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { UploadableStorageProvider } from "../storage";
import { addAccountGroupMember } from "./account-groups";
import { createAccountGroup } from "./knowledge/system-types/account.fields";
import { createOrg, getOrgByShortname } from "./knowledge/system-types/org";
import {
  createEntityType,
  getEntityTypeById,
} from "./ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
} from "./ontology/primitive/property-type";
import { systemAccountId } from "./system-account";

/** @todo: enable admins to expand upon restricted shortnames block list */
export const RESTRICTED_SHORTNAMES = [
  "-",
  ".well-known",
  "404.html",
  "422.html",
  "500.html",
  "502.html",
  "503.html",
  "abuse_reports",
  "admin",
  "ag",
  "api",
  "apple-touch-icon-precomposed.png",
  "apple-touch-icon.png",
  "assets",
  "autocomplete",
  "bh",
  "bhg",
  "dashboard",
  "deploy.html",
  "dw",
  "example",
  "explore",
  "favicon.ico",
  "favicon.png",
  "files",
  "groups",
  "health_check",
  "help",
  "import",
  "invites",
  "jwt",
  "local",
  "login",
  "new",
  "oauth",
  "org",
  "profile",
  "projects",
  "public",
  "robots.txt",
  "s",
  "search",
  "sent_notifications",
  "slash-command-logo.png",
  "snippets",
  "unsubscribes",
  "uploads",
  "user",
  "users",
  "v2",
];

export type GraphApi = GraphApiClient & DataSource;

export type ImpureGraphContext = {
  graphApi: GraphApi;
  uploadProvider: UploadableStorageProvider;
  /** @todo: add logger? */
};

export type ImpureGraphFunction<Parameters, ReturnType> = (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;

// Whether this is a self-hosted instance, rather than the central HASH hosted instance
export const isSelfHostedInstance = ![
  "http://localhost:3000",
  "https://app.hash.ai",
  "https://hash.ai",
].includes(frontendUrl);

type OwningWebShortname = "hash" | "linear";

const owningWebs: Record<
  OwningWebShortname,
  {
    accountGroupId?: AccountGroupId;
    name: string;
    website: string;
  }
> = {
  hash: {
    name: "HASH",
    website: "https://hash.ai",
  },
  linear: {
    name: "Linear",
    website: "https://linear.app",
  },
};

const getOrCreateOwningAccountGroupId = async (
  context: ImpureGraphContext,
  webShortname: OwningWebShortname,
) => {
  const authentication = { actorId: systemAccountId };

  if (isSelfHostedInstance) {
    throw new Error(
      "Should not create owning organization for system types on self-hosted instance – system types should be loaded as external types instead",
    );
  }

  // We only need to resolve this once for each shortname during the seeding process
  const resolvedAccountGroupId = owningWebs[webShortname].accountGroupId;
  if (resolvedAccountGroupId) {
    return resolvedAccountGroupId;
  }

  try {
    // If this function is used again after the initial seeding, it's possible that we've created the org in the past
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (foundOrg) {
      logger.debug(
        `Found org entity with shortname ${webShortname}, accountGroupId: ${foundOrg.accountGroupId}`,
      );
      owningWebs[webShortname].accountGroupId = foundOrg.accountGroupId;
      return foundOrg.accountGroupId;
    }
  } catch {
    // No org system type yet, this must be the first time the seeding has run
  }

  const accountGroupId = await createAccountGroup(context, authentication, {});
  await addAccountGroupMember(context, authentication, {
    accountId: systemAccountId,
    accountGroupId,
  });

  owningWebs[webShortname].accountGroupId = accountGroupId;

  logger.info(
    `Created accountGroup for org with shortname ${webShortname}, accountGroupId: ${accountGroupId}`,
  );

  return accountGroupId;
};

export const ensureAccountGroupOrgsExist = async (params: {
  context: ImpureGraphContext;
}) => {
  const { context } = params;

  logger.debug("Ensuring account group organization entities exist");

  for (const [webShortname, { name, website }] of Object.entries(owningWebs)) {
    const authentication = { actorId: systemAccountId };
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (!foundOrg) {
      const orgAccountGroupId = await getOrCreateOwningAccountGroupId(
        context,
        webShortname as OwningWebShortname,
      );

      await createOrg(context, authentication, {
        orgAccountGroupId,
        shortname: webShortname,
        name,
        website,
      });

      logger.info(
        `Created organization entity for '${webShortname}' with accountGroupId '${orgAccountGroupId}'`,
      );
    }
  }
};

export type PropertyTypeCreatorParams = {
  propertyTypeId: VersionedUrl;
  title: string;
  description?: string;
  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeKey;
    propertyTypeObjectProperties?: { [_ in string]: { $ref: VersionedUrl } };
    array?: boolean;
  }[];
  webShortname: OwningWebShortname;
};

/**
 * Helper method for generating a property type schema for the Graph API.
 */
export const generateSystemPropertyTypeSchema = (
  params: Omit<PropertyTypeCreatorParams, "webShortname">,
): PropertyType => {
  const possibleValues: PropertyValues[] = params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObjectProperties }) => {
      let inner: PropertyValues;

      if (primitiveDataType) {
        const dataTypeReference: DataTypeReference = {
          $ref: systemTypes.dataType[primitiveDataType].dataTypeId,
        };
        inner = dataTypeReference;
      } else if (propertyTypeObjectProperties) {
        const propertyTypeObject: ObjectSchema<
          ValueOrArray<PropertyTypeReference>
        > = {
          type: "object" as const,
          properties: propertyTypeObjectProperties,
        };
        inner = propertyTypeObject;
      } else {
        throw new Error(
          "Please provide either a primitiveDataType or propertyTypeObjectProperties to generateSystemPropertyTypeSchema",
        );
      }

      // Optionally wrap inner in an array
      if (array) {
        const arrayOfPropertyValues: Array<OneOf<PropertyValues>> = {
          type: "array",
          items: {
            oneOf: [inner],
          },
        };
        return arrayOfPropertyValues;
      } else {
        return inner;
      }
    },
  );

  return {
    $schema: PROPERTY_TYPE_META_SCHEMA,
    kind: "propertyType",
    $id: params.propertyTypeId,
    title: params.title,
    description: params.description,
    oneOf: possibleValues as [PropertyValues, ...PropertyValues[]],
  };
};

/**
 * Returns a function which can be used to initialize a given property type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new property type
 * @returns an async function which can be called to initialize the property type, returning its property type
 */
export const propertyTypeInitializer = (
  params: PropertyTypeCreatorParams,
): ((context: ImpureGraphContext) => Promise<PropertyTypeWithMetadata>) => {
  let propertyType: PropertyTypeWithMetadata;

  return async (context?: ImpureGraphContext) => {
    const authentication = { actorId: systemAccountId };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (propertyType) {
      return propertyType;
    } else if (!context) {
      throw new Error(
        `property type ${params.title} was uninitialized, and function was called without passing a context object`,
      );
    } else {
      const propertyTypeSchema = generateSystemPropertyTypeSchema(params);

      // initialize
      propertyType = await getPropertyTypeById(context, authentication, {
        propertyTypeId: propertyTypeSchema.$id,
      }).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it

          if (isSelfHostedInstance) {
            // If this is a self-hosted instance, the system types will be created as external types without an in-instance web
            await context.graphApi.loadExternalPropertyType(
              authentication.actorId,
              {
                propertyTypeId: propertyTypeSchema.$id,
                // Specify the schema so that self-hosted instances don't need network access to hash.ai
                // BLOCKED by H-1164 @todo remove this comment when H-1164 is merged
                // @ts-expect-error –– error will disappear when H-1164 is merged, and this line can be removed
                schema: propertyTypeSchema,
              },
            );

            return await getPropertyTypeById(context, authentication, {
              propertyTypeId: propertyTypeSchema.$id,
            });
          } else {
            // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
            const accountGroupId = await getOrCreateOwningAccountGroupId(
              context,
              params.webShortname,
            );
            const createdPropertyType = await createPropertyType(
              context,
              authentication,
              {
                ownedById: accountGroupId as OwnedById,
                schema: propertyTypeSchema,
                webShortname: params.webShortname,
              },
            ).catch((createError) => {
              logger.warn(
                `Failed to create property type: ${params.propertyTypeId}`,
              );
              throw createError;
            });

            // @todo BEFORE MERGING remove the web as an owner, and add the systemAccountId as an owner

            return createdPropertyType;
          }
        } else {
          logger.warn(
            `Failed to check existence of property type: ${params.propertyTypeId}`,
          );
          throw error;
        }
      });

      return propertyType;
    }
  };
};

type LinkDestinationConstraint =
  | EntityTypeWithMetadata
  | VersionedUrl
  // Some models may reference themselves. This marker is used to stop infinite loops during initialization by telling the initializer to use a self reference
  | "SELF_REFERENCE";

export type EntityTypeCreatorParams = {
  allOf?: VersionedUrl[];
  entityTypeId: VersionedUrl;
  title: string;
  description?: string;
  properties?: {
    propertyType: PropertyTypeWithMetadata | VersionedUrl;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
  outgoingLinks?: {
    linkEntityType: EntityTypeWithMetadata | VersionedUrl;
    destinationEntityTypes?: [
      LinkDestinationConstraint,
      ...LinkDestinationConstraint[],
    ];
    minItems?: number;
    maxItems?: number;
    ordered?: boolean;
  }[];
  webShortname: OwningWebShortname;
};

/**
 * Helper method for generating an entity type schema for the Graph API.
 */
export const generateSystemEntityTypeSchema = (
  params: Omit<EntityTypeCreatorParams, "webShortname">,
): EntityType => {
  /** @todo - clean this up to be more readable: https://app.asana.com/0/1202805690238892/1202931031833226/f */
  const properties =
    params.properties?.reduce(
      (prev, { propertyType, array }) => ({
        ...prev,
        [typeof propertyType === "object"
          ? propertyType.metadata.recordId.baseUrl
          : extractBaseUrl(propertyType)]: array
          ? {
              type: "array",
              items: {
                $ref:
                  typeof propertyType === "object"
                    ? propertyType.schema.$id
                    : propertyType,
              },
              ...(array === true ? {} : array),
            }
          : {
              $ref:
                typeof propertyType === "object"
                  ? propertyType.schema.$id
                  : propertyType,
            },
      }),
      {},
    ) ?? {};

  const requiredProperties = params.properties
    ?.filter(({ required }) => !!required)
    .map(({ propertyType }) =>
      typeof propertyType === "object"
        ? propertyType.metadata.recordId.baseUrl
        : extractBaseUrl(propertyType),
    );

  const links =
    params.outgoingLinks?.reduce<EntityType["links"]>(
      (
        prev,
        {
          linkEntityType,
          destinationEntityTypes,
          ordered = false,
          minItems,
          maxItems,
        },
      ): EntityType["links"] => ({
        ...prev,
        [typeof linkEntityType === "object"
          ? linkEntityType.schema.$id
          : linkEntityType]: {
          type: "array",
          ordered,
          items: destinationEntityTypes
            ? {
                oneOf: destinationEntityTypes.map(
                  (entityTypeIdOrReference) => ({
                    $ref:
                      entityTypeIdOrReference === "SELF_REFERENCE"
                        ? params.entityTypeId
                        : typeof entityTypeIdOrReference === "object"
                        ? entityTypeIdOrReference.schema.$id
                        : entityTypeIdOrReference,
                  }),
                ),
              }
            : {},
          minItems,
          maxItems,
        },
      }),
      {},
    ) ?? undefined;

  const allOf = params.allOf?.map((url) => ({ $ref: url }));

  return {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: params.entityTypeId,
    allOf,
    title: params.title,
    description: params.description,
    type: "object",
    properties,
    required: requiredProperties,
    links,
  };
};

export type LinkEntityTypeCreatorParams = Omit<
  EntityTypeCreatorParams,
  "entityTypeId"
> & {
  linkEntityTypeId: VersionedUrl;
};

/**
 * Helper method for generating a link entity type schema for the Graph API.
 */
export const generateSystemLinkEntityTypeSchema = (
  params: Omit<LinkEntityTypeCreatorParams, "webShortname">,
): EntityType => {
  const baseSchema = generateSystemEntityTypeSchema({
    ...params,
    entityTypeId: params.linkEntityTypeId,
  });

  return {
    ...baseSchema,
    allOf: [
      ...(baseSchema.allOf ?? []),
      {
        $ref: linkEntityTypeUrl,
      },
    ],
  };
};

/**
 * Returns a function which can be used to initialize a given entity type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new entity type
 * @returns an async function which can be called to initialize the entity type, returning its entity type
 */
export const entityTypeInitializer = (
  params: EntityTypeCreatorParams | LinkEntityTypeCreatorParams,
): ((context: ImpureGraphContext) => Promise<EntityTypeWithMetadata>) => {
  let entityType: EntityTypeWithMetadata | undefined;

  return async (context?: ImpureGraphContext) => {
    const authentication = { actorId: systemAccountId };

    if (entityType) {
      return entityType;
    } else if (!context) {
      throw new Error(
        `entity type ${params.title} was uninitialized, and function was called without passing a context object`,
      );
    } else {
      const entityTypeSchema =
        "linkEntityTypeId" in params
          ? generateSystemLinkEntityTypeSchema(params)
          : generateSystemEntityTypeSchema(params);

      // initialize
      entityType = await getEntityTypeById(context, authentication, {
        entityTypeId: entityTypeSchema.$id,
      }).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it
          if (isSelfHostedInstance) {
            // If this is a self-hosted instance, the system types will be created as external types without an in-instance web
            await context.graphApi.loadExternalEntityType(systemAccountId, {
              entityTypeId: entityTypeSchema.$id,
              // Specify the schema so that self-hosted instances don't need network access to hash.ai
              // BLOCKED by H-1164 @todo remove this comment when H-1164 is merged
              // @ts-expect-error –– error will disappear when H-1164 is merged, and this line can be removed
              schema: entityTypeSchema,
            });

            return await getEntityTypeById(context, authentication, {
              entityTypeId: entityTypeSchema.$id,
            });
          } else {
            // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
            const accountGroupId = await getOrCreateOwningAccountGroupId(
              context,
              params.webShortname,
            );
            const createdEntityType = await createEntityType(
              context,
              authentication,
              {
                ownedById: accountGroupId as OwnedById,
                schema: entityTypeSchema,
                webShortname: params.webShortname,
              },
            ).catch((createError) => {
              logger.warn(
                `Failed to create entity type: ${entityTypeSchema.$id}`,
              );
              throw createError;
            });

            // @todo BEFORE MERGING remove the web as an owner, and add the systemAccountId as an owner

            return createdEntityType;
          }
        } else {
          logger.warn(
            `Failed to check existence of entity type: ${params.title}`,
          );
          throw error;
        }
      });

      return entityType;
    }
  };
};
