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
  $id ? FRONTEND_URL + url.parse($id).pathname : undefined;

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

  static create =
    (db: DBClient) =>
    async (args: {
      accountId: string;
      createdById: string;
      description?: string | null;
      name: string;
      schema?: JSONObject | null;
    }): Promise<EntityType> => {
      const { accountId, createdById, description, schema, name } = args;

      const entityType = await db
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
    };

  static getEntityType = (db: DBClient) => (args: { entityTypeId: string }) =>
    db
      .getEntityTypeLatestVersion(args)
      .then((dbEntityType) =>
        dbEntityType ? new EntityType(dbEntityType) : null,
      );

  static getEntityTypeType = async (db: DBClient) =>
    db
      .getSystemTypeLatestVersion({ systemTypeName: "EntityType" })
      .then((entityTypeType) => {
        if (!entityTypeType) {
          throw new Error(
            "EntityType system entity type not found in datastore",
          );
        }

        return new EntityType(entityTypeType);
      });

  static getAccountEntityTypes =
    (db: DBClient) =>
    (args: { accountId: string; includeOtherTypesInUse?: boolean | null }) =>
      db
        .getAccountEntityTypes(args)
        .then((types) =>
          types.map((dbType) => new EntityType(dbType).toGQLEntityType()),
        );

  toGQLEntityType = (): UnresolvedGQLEntityType => ({
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
    createdAt: this.entityCreatedAt,
    entityVersionCreatedAt: this.entityVersionCreatedAt,
    updatedAt: this.entityVersionUpdatedAt,
    visibility: Visibility.Public /** @todo: get from entity metadata */,
  });
}

export default __EntityType;
