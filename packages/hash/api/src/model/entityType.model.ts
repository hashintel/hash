import { ApolloError } from "apollo-server-express";
import url from "url";
import fetch from "node-fetch";
import { JSONObject } from "blockprotocol";

import { EntityExternalResolvers, EntityType } from ".";
import { DBClient } from "../db";
import {
  EntityType as GQLEntityType,
  Visibility,
} from "../graphql/apiTypes.gen";
import { EntityTypeMeta, EntityTypeTypeFields } from "../db/adapter";

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
  properties: JSONObject;
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

  static async create(
    client: DBClient,
    params: {
      accountId: string;
      createdByAccountId: string;
      description?: string | null;
      name: string;
      schema?: JSONObject | null;
    },
  ): Promise<EntityType> {
    const { accountId, createdByAccountId, description, schema, name } = params;

    const entityType = await client
      .createEntityType({
        accountId,
        createdByAccountId,
        description,
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

  static async updateSchema(
    client: DBClient,
    params: {
      accountId: string;
      createdByAccountId: string;
      entityId: string;
      schema: JSONObject;
      updatedByAccountId: string;
    },
  ) {
    const updatedDbEntityType = await client.updateEntityType(params);

    return new EntityType(updatedDbEntityType);
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

  static async getEntityTypeChildren(
    client: DBClient,
    params: { schemaRef: string },
  ) {
    const dbEntityTypes = await client.getEntityTypeChildren(params);

    return dbEntityTypes.map((entityType) => new EntityType(entityType));
  }

  static async getEntityTypeParents(
    client: DBClient,
    params: { entityTypeId: string },
  ) {
    const dbEntityTypes = await client.getEntityTypeParents(params);

    return dbEntityTypes.map((entityType) => new EntityType(entityType));
  }

  public static async fetchComponentIdBlockSchema(componentId: string) {
    const componentIdUrl = new URL(
      "./block-schema.json",
      `${componentId.replace(/\/+$/, "")}/`,
    );

    const blockSchema = await (await fetch(componentIdUrl.href))
      .json()
      .catch(() => ({}));

    return { ...blockSchema, componentId };
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
        $id: schema$idWithFrontendDomain(
          this.properties.$id as string | undefined,
        ),
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
