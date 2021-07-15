import { DataSource } from "apollo-datasource";

export type Entity = {
  accountId: string;
  entityId: string;
  createdById: string;
  type: string;
  properties: any;
  metadata: EntityMeta;
  historyId: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type EntityMeta = {
  metadataId: string;
  extra: any;
};

/**
 * Generic interface to the database.
 */
export interface DBAdapter extends DataSource {
  /**
   * Create a new entity. If "id" is not provided it will be automatically generated. To
   * create a versioned entity, set the optional parameter "versioned" to `true`.
   * */
  createEntity(params: {
    accountId: string;
    entityId?: string;
    createdById: string;
    type: string;
    versioned?: boolean;
    properties: any;
  }): Promise<Entity>;

  /** Get an entity by ID in a given namespace. */
  getEntity(params: {
    accountId: string;
    entityId: string;
  }): Promise<Entity | undefined>;

  /** Update an entity's properties. If the parameter "type" is provided, the function
   * checks that the entity's type matches before updating.
   */
  updateEntity(params: {
    accountId: string;
    entityId: string;
    type?: string;
    properties: any;
  }): Promise<Entity[]>;

  /** Get all entities of a given type. */
  getEntitiesByType(params: {
    accountId: string;
    type: string;
  }): Promise<Entity[]>;

  /** Get all namespace entities in the database, that is, those entities where the
   * namespace ID equals the entity ID
   */
  getNamespaceEntities(): Promise<Entity[]>;

  /** Update the metadata which may be associated with one or more entities. */
  updateEntityMetadata(params: {
    accountId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta>;
}
