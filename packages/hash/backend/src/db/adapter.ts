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

export type EntityVersion = {
  entityId: string;
  createdAt: Date;
  createdById: string;
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

  /** Get an entity by ID in a given account. */
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

  /**
   * Get all entities of a given type. If `latestOnly` is set to true, then only the
   * latest version of each entity is returned. This parameter is ignored for non-versioned
   * entities.
   * */
  getEntitiesByType(params: {
    accountId: string;
    type: string;
    latestOnly: boolean;
  }): Promise<Entity[]>;

  /** Get all entities in the database belonging to a specific account
   */
  getAccountEntities(): Promise<Entity[]>;

  /** Update the metadata which may be associated with one or more entities. */
  updateEntityMetadata(params: {
    accountId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta>;

  /**
   * getAndUpdateEntity may be used to retrieve and update an entity within
   * the same transaction. It accepts a handler function which, given the
   * current state of the entity, should return an updated state. Returns
   * the state of all updated entities.
   * */
  getAndUpdateEntity(params: {
    accountId: string;
    entityId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]>;

  /**
   * getEntityHistory returns the sorted version timeline of an entity given its
   * `historyId`. Returns `undefined` if the entity is non versioned.
   * */
  getEntityHistory(params: {
    accountId: string;
    historyId: string;
  }): Promise<EntityVersion[] | undefined>;
}
