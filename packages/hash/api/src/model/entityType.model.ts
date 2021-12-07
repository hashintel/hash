import { ApolloError } from "apollo-server-express";
import url from "url";
import { JSONObject } from "@hashintel/block-protocol";

import { EntityExternalResolvers, EntityType } from ".";
import { DBClient } from "../db";
import {
  EntityType as GQLEntityType,
  Visibility,
} from "../graphql/apiTypes.gen";
import { EntityTypeTypeFields } from "../db/adapter";

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
  createdById: string;
  accountId: string;
  properties: JSONObject;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;
};

const schemaIdWithFrontendDomain = ($id?: string) =>
  $id ? `${FRONTEND_URL}${url.parse($id).pathname}` : undefined;

// This is a bit repetitive of Entity, but we don't want the methods on Entity available on this
class __EntityType {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  properties: JSONObject;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    createdById,
    accountId,
    properties,
    entityCreatedAt,
    entityVersionCreatedAt,
    entityVersionUpdatedAt,
  }: EntityTypeConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.createdById = createdById;
    this.accountId = accountId;
    this.properties = properties;
    this.entityCreatedAt = entityCreatedAt;
    this.entityVersionCreatedAt = entityVersionCreatedAt;
    this.entityVersionUpdatedAt = entityVersionUpdatedAt;
  }

  static async create(
    client: DBClient,
    params: {
      accountId: string;
      createdById: string;
      description?: string | null;
      name: string;
      schema?: JSONObject | null;
    },
  ): Promise<EntityType> {
    const { accountId, createdById, description, schema, name } = params;

    const entityType = await client
      .createEntityType({
        accountId,
        createdById,
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
      createdById: string;
      entityId: string;
      schema: JSONObject;
    },
  ) {
    const updatedDbEntityType = await client.updateEntityType(params);

    return new EntityType(updatedDbEntityType);
  }

  static async getEntityType(
    client: DBClient,
    params: { entityTypeId: string },
  ) {
    const dbEntityType = await client.getEntityTypeLatestVersion(params);

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

  toGQLEntityType(): UnresolvedGQLEntityType {
    return {
      id: this.entityVersionId,
      entityId: this.entityId,
      entityVersionId: this.entityVersionId,
      createdById: this.createdById,
      accountId: this.accountId,
      properties: {
        ...this.properties,
        $id: schemaIdWithFrontendDomain(
          this.properties.$id as string | undefined,
        ),
      },
      metadataId: this.entityId,
      createdAt: this.entityCreatedAt.toISOString(),
      entityVersionCreatedAt: this.entityVersionCreatedAt.toISOString(),
      updatedAt: this.entityVersionUpdatedAt.toISOString(),
      visibility: Visibility.Public /** @todo: get from entity metadata */,
    };
  }
}

export default __EntityType;
