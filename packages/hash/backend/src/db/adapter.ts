import { DataSource } from "apollo-datasource";

export type Entity = {
  namespaceId: string,
  id: string,
  createdById: string,
  type: string,
  properties: any,
  createdAt: Date,
  updatedAt: Date,
};


/**
 * Generic interface to the database.
 */
export interface DBAdapter extends DataSource {

  /** Create a new entity. */
  createEntity(params: {
    namespaceId: string,
    createdById: string,
    type: string,
    properties: any
  }): Promise<Entity>

  /** Get an entity by ID in a given namespace. */
  getEntity(params: { namespaceId: string, id: string }): Promise<Entity | undefined>

  /** Update an entity's properties. */
  updateEntity(params: {
    namespaceId: string,
    id: string,
    properties: any
  }): Promise<Entity | undefined>

  /** Get all entities of a given type. */
  getEntitiesByType(params: {
    namespaceId: string,
    type: string,
  }): Promise<Entity[]>

}