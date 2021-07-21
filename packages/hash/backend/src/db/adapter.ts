import { DataSource } from "apollo-datasource";
import { DbUser } from "src/types/dbTypes";

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

export type LoginCode = {
  id: string;
  code: string;
  userId: string;
  numberOfAttempts: number;
  createdAt: Date;
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

  /** Get the user by their id. */
  getUserById(params: { id: string }): Promise<DbUser | null>;

  /** Get the user by their email address. */
  getUserByEmail(params: { email: string }): Promise<DbUser | null>;

  /** Get the user by their shortname. */
  getUserByShortname(params: { shortname: string }): Promise<DbUser | null>;

  /** Get all entities of a given type. */
  getEntitiesByType(params: {
    accountId: string;
    type: string;
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

  /** Create a login code */
  createLoginCode(params: { userId: string; code: string }): Promise<LoginCode>;

  /** Get a login code (it may be invalid!) */
  getLoginCode(params: { loginId: string }): Promise<LoginCode | null>;

  /** Increment the number of login attempts by 1 */
  incrementLoginCodeAttempts(params: { loginCode: LoginCode }): Promise<void>;

  /** Prunes login codes from the database after 1 day of creation */
  pruneLoginCodes(): Promise<number>;

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
}
