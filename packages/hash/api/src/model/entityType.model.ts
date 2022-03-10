import { ApolloError } from "apollo-server-express";
import url from "url";
import fetch from "node-fetch";
import { JSONObject } from "blockprotocol";
import { merge } from "lodash";
import { JSONSchema7 } from "json-schema";

import { EntityExternalResolvers, EntityType } from ".";
import { DBClient } from "../db";
import {
  EntityType as GQLEntityType,
  Visibility,
} from "../graphql/apiTypes.gen";
import { EntityTypeMeta, EntityTypeTypeFields } from "../db/adapter";
import {
  tryCompileSchema,
  entityTypePropertyKeyValidator,
  getSchemaAllOfRefs,
  JSON_SCHEMA_VERSION,
  SchemaTypeMismatch,
} from "./entityType.util";

const { FRONTEND_URL } = require("../lib/config");

/**
 * We handle the various entityType fields for an entityType in separate field resolvers,
 * to allow consumers to recursively request the entityType of an entityType, and so on.
 */
type EntityTypeWithoutTypeFields = Omit<GQLEntityType, EntityTypeTypeFields>;

export type UnresolvedGQLEntityType = Omit<
  EntityTypeWithoutTypeFields,
  EntityExternalResolvers
>;

export type EntityTypeConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  accountId: string;
  properties: JSONObject;
  metadata: EntityTypeMeta;
  createdByAccountId: string;
  createdAt: Date;
  updatedByAccountId: string;
  updatedAt: Date;
};

const schema$idWithFrontendDomain = ($id?: string) =>
  $id ? `${FRONTEND_URL}${url.parse($id).pathname}` : undefined;

// This is a bit repetitive of Entity, but we don't want the methods on Entity available on this
class __EntityType {
  entityId: string;
  entityVersionId: string;
  accountId: string;
  /** @todo: consider extending this type to be fully compatible with Draft 08 (2019-09) */
  properties: JSONSchema7;
  metadata: EntityTypeMeta;
  createdByAccountId: string;
  createdAt: Date;
  updatedByAccountId: string;
  updatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    accountId,
    properties,
    metadata,
    createdByAccountId,
    createdAt,
    updatedByAccountId,
    updatedAt,
  }: EntityTypeConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.accountId = accountId;
    this.properties = properties;
    this.metadata = metadata;
    this.createdByAccountId = createdByAccountId;
    this.createdAt = createdAt;
    this.updatedByAccountId = updatedByAccountId;
    this.updatedAt = updatedAt;
  }

  /**
   * *This is a slow operation!*
   * When a JSON schema is to be validated, the whole schema inheritance chain
   * is validated.
   *
   * Validations include properties with the same name and verifying constraints
   * are valid.
   *
   * @param client
   * @param params
   * @returns
   */
  static async validateJsonSchema(
    client: DBClient,
    params: {
      $id?: string;
      title: string;
      schema?: string | JSONSchema7 | null;
      description?: string;
    },
  ): Promise<JSONSchema7> {
    const { $id, title, schema: maybeStringifiedSchema, description } = params;

    if (title[0] !== title[0].toUpperCase()) {
      throw new Error(
        `Schema title should be in PascalCase, you passed '${title}'`,
      );
    }

    const partialSchema: JSONSchema7 =
      typeof maybeStringifiedSchema === "string"
        ? JSON.parse(maybeStringifiedSchema)
        : maybeStringifiedSchema ?? {};

    const schema = {
      ...partialSchema,
      $schema: JSON_SCHEMA_VERSION,
      $id,
      title,
      type: partialSchema.type ?? "object",
      description: partialSchema.description ?? description,
    };

    const parents = getSchemaAllOfRefs(schema);
    const allSchemas = (
      await Promise.all(
        parents.map(async (schema$id) => {
          const parentEntity = await EntityType.getEntityTypeBySchema$id(
            client,
            {
              schema$id,
            },
          );

          const parentInheritanceChain = await parentEntity.getInheritanceChain(
            client,
          );

          return [parentEntity, ...parentInheritanceChain];
        }),
      )
    ).flat();

    const validationErrors = entityTypePropertyKeyValidator(
      schema,
      ...allSchemas,
    );

    if (validationErrors.length > 0) {
      throw new SchemaTypeMismatch(validationErrors.join("\n"));
    }

    await tryCompileSchema(schema);

    return schema;
  }

  static async create(
    client: DBClient,
    params: {
      accountId: string;
      createdByAccountId: string;
      description?: string;
      name: string;
      schema?: JSONObject | null;
    },
  ): Promise<EntityType> {
    const { accountId, createdByAccountId, description, name } = params;

    const schema = await EntityType.validateJsonSchema(client, {
      title: name,
      schema: params.schema,
      description,
    });

    const entityType = await client
      .createEntityType({
        accountId,
        createdByAccountId,
        name,
        schema,
      })
      .catch((err) => {
        if (err.message.includes("not unique")) {
          throw new ApolloError(err.message, "NAME_NOT_UNIQUE");
        }
        throw err;
      });

    return new EntityType(entityType);
  }

  async update(
    client: DBClient,
    params: {
      accountId: string;
      createdByAccountId: string;
      schema: Record<string, any>;
      updatedByAccountId: string;
    },
  ) {
    const {
      schema: { title, description },
    } = params;

    const schema = await EntityType.validateJsonSchema(client, {
      title,
      schema: params.schema,
      description,
    });

    const updatedDbEntityType = await client.updateEntityType({
      ...params,
      entityId: this.entityId,
      schema,
    });

    merge(this, new EntityType(updatedDbEntityType));

    return this;
  }

  static async getEntityType(
    client: DBClient,
    params: { entityTypeId?: string; entityTypeVersionId?: string },
  ) {
    const { entityTypeId, entityTypeVersionId } = params;
    if (entityTypeId) {
      const dbEntityType = await client.getEntityTypeLatestVersion({
        entityTypeId,
      });
      return dbEntityType ? new EntityType(dbEntityType) : null;
    } else if (entityTypeVersionId) {
      const dbEntityType = await client.getEntityType({ entityTypeVersionId });
      return dbEntityType ? new EntityType(dbEntityType) : null;
    } else {
      throw new Error(
        "Expected either `entityTypeId` or `entityTypeVersionId`",
      );
    }
  }

  static async getEntityTypeByComponentId(
    client: DBClient,
    params: { componentId: string },
  ) {
    const dbEntityType = await client.getEntityTypeByComponentId(params);
    return dbEntityType ? new EntityType(dbEntityType) : null;
  }

  static async getEntityTypeBySchema$id(
    client: DBClient,
    params: { schema$id: string },
  ): Promise<EntityType> {
    const dbEntityType = await client.getEntityTypeBySchema$id(params);
    if (!dbEntityType) {
      throw new Error(
        `Critical: Could not find EntityType by Schema$id = ${params.schema$id}`,
      );
    }
    return new EntityType(dbEntityType);
  }

  static async getEntityTypeType(client: DBClient) {
    const dbEntityTypeEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "EntityType",
    });
    return new EntityType(dbEntityTypeEntityType);
  }

  static async getAccountEntityTypes(
    client: DBClient,
    params: { accountId: string; includeOtherTypesInUse?: boolean | null },
  ) {
    const dbTypes = await client.getAccountEntityTypes(params);

    return dbTypes.map((dbType) => new EntityType(dbType).toGQLEntityType());
  }

  static async getImmediateChildren(
    client: DBClient,
    params: { schemaRef: string },
  ) {
    const dbEntityTypes = await client.getEntityTypeChildren(params);

    return dbEntityTypes.map((entityType) => new EntityType(entityType));
  }

  async getImmediateParents(client: DBClient): Promise<EntityType[]> {
    const parentSchema$ids = getSchemaAllOfRefs(this.properties);

    return await Promise.all(
      parentSchema$ids.map(async (schema$id) => {
        const parentEntityType = await EntityType.getEntityTypeBySchema$id(
          client,
          {
            schema$id,
          },
        );

        return parentEntityType;
      }),
    );
  }

  async getInheritanceChain(client: DBClient): Promise<EntityType[]> {
    const parents = await this.getImmediateParents(client);

    const allSchemas = await Promise.all(
      parents.map(async (parent) => [
        parent,
        ...(await parent.getImmediateParents(client)),
      ]),
    );

    return allSchemas.flat();
  }

  public static async fetchComponentIdBlockSchema(componentId: string) {
    const componentIdUrl = new URL(
      "./block-schema.json",
      `${componentId.replace(/\/+$/, "")}/`,
    );

    // @todo: consider security implications of requesting user-supplied URLs here.
    const blockSchema = await (await fetch(componentIdUrl.href))
      .json()
      .catch(() => ({}));

    return { ...blockSchema, componentId };
  }

  get schema$idWithFrontendDomain() {
    return schema$idWithFrontendDomain(this.properties.$id);
  }

  toGQLEntityType(): UnresolvedGQLEntityType {
    return {
      id: this.entityVersionId,
      entityId: this.entityId,
      entityVersionId: this.entityVersionId,
      createdByAccountId: this.createdByAccountId,
      accountId: this.accountId,
      properties: {
        ...this.properties,
        $id: this.schema$idWithFrontendDomain,
      },
      metadataId: this.entityId,
      createdAt: this.createdAt.toISOString(),
      entityVersionCreatedAt: this.updatedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      visibility: Visibility.Public /** @todo: get from entity metadata */,
    };
  }
}

export default __EntityType;
