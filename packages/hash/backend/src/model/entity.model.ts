import { DBAdapter } from "../db";
import {
  Entity as GQLEntity,
  UnknownEntity as GQLUnknownEntity,
  Visibility,
} from "../graphql/apiTypes.gen";

export type EntityConstructorArgs = {
  id: string;
  createdById: string;
  accountId: string;
  type: string;
  properties: any;
  metadataId: string;
  // metadata: EntityMeta;
  createdAt: Date;
  updatedAt: Date;
};

class Entity {
  id: string;
  createdById: string;
  accountId: string;
  type: string;
  properties: any;
  metadataId: string;
  // metadata: EntityMeta;
  createdAt: Date;
  updatedAt: Date;

  constructor({
    id,
    createdById,
    accountId,
    type,
    properties,
    metadataId,
    // metadata,
    createdAt,
    updatedAt,
  }: EntityConstructorArgs) {
    this.id = id;
    this.createdById = createdById;
    this.accountId = accountId;
    this.type = type;
    this.properties = properties;
    this.metadataId = metadataId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static getEntityById =
    (db: DBAdapter) =>
    ({
      accountId,
      entityId,
    }: {
      accountId: string;
      entityId: string;
    }): Promise<Entity | null> =>
      db
        .getEntity({
          accountId,
          entityId,
        })
        .then((dbEntity) =>
          dbEntity ? new Entity({ id: entityId, ...dbEntity }) : null
        );

  toGQLEntity = (): GQLEntity => ({
    id: this.id,
    createdById: this.createdById,
    accountId: this.accountId,
    type: this.type,
    metadataId: this.metadataId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    visibility: Visibility.Public, // TODO: get from entity metadata
  });

  toGQLUnknownEntity = (): GQLUnknownEntity => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default Entity;
