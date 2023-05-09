import { promises as fs } from "node:fs";

import { GraphStatus } from "@apps/hash-graph/type-defs/status";
import {
  DataTypeStructuralQuery,
  EntityStructuralQuery,
  EntityTypeStructuralQuery,
  PropertyTypeStructuralQuery,
} from "@local/hash-graph-client";
import {
  DataTypeRootType,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
  Subgraph,
} from "@local/hash-subgraph";
import fetch from "node-fetch";

import { createTestImpureGraphContext } from "./util";

const deleteRecords = async (endpoint: string) => {
  await fetch(`http://127.0.0.1:4001/${endpoint}`, { method: "DELETE" }).then(
    async (response) => {
      const status: GraphStatus = await response.json();
      if (status.code !== "OK") {
        throw new Error(
          `Could not remove ${endpoint}: ${JSON.stringify(status)}`,
        );
      }
    },
  );
};

/**
 * Delete all accounts from the Graph.
 *
 * This will fail if there are is any data in the Graph.
 */
export const deleteAccounts = async () => {
  await deleteRecords("accounts");
};

/**
 * Delete all data types from the Graph.
 *
 * This will fail if there are any property types in the Graph that use data types.
 */
export const deleteDataTypes = async () => {
  await deleteRecords("data-types");
};

/**
 * Delete all property types from the Graph.
 *
 * This will fail if there are any entity types in the Graph that use property types.
 */
export const deletePropertyTypes = async () => {
  await deleteRecords("property-types");
};

/**
 * Delete all entity types from the Graph.
 *
 * This will fail if there are still entities in the Graph that use entity types.
 */
export const deleteEntityTypes = async () => {
  await deleteRecords("entity-types");
};

/**
 * Delete all entities from the Graph.
 */
export const deleteEntities = async () => {
  await deleteRecords("entities");
};

/**
 * Restore a snapshot from a file.
 */
export const restoreSnapshot = async (snapshotPath: string) => {
  await fs
    .readFile(snapshotPath)
    .then((snapshot) =>
      fetch("http://127.0.0.1:4001/snapshot", {
        method: "POST",
        body: snapshot,
      }),
    )
    .then(async (response) => {
      const status: GraphStatus = await response.json();
      if (status.code !== "OK") {
        throw new Error(
          `Snapshot restoration error: ${JSON.stringify(status)}`,
        );
      }
    });
};

/**
 * Reset the Graph to the state of the snapshot.
 *
 * This is a convenience function for deleting all entities, entity types, property types, data types, and accounts, and
 * then restoring the snapshot.
 */
export const resetToSnapshot = async (snapshotPath: string) => {
  await deleteEntities();
  await deleteEntityTypes();
  await deletePropertyTypes();
  await deleteDataTypes();
  await deleteAccounts();

  await restoreSnapshot(snapshotPath);
};

const graphContext = createTestImpureGraphContext();

export const getDataTypes = async (
  query: DataTypeStructuralQuery,
): Promise<Subgraph<DataTypeRootType>> => {
  return await graphContext.graphApi
    .getDataTypesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<DataTypeRootType>);
};

export const getPropertyTypes = async (
  query: PropertyTypeStructuralQuery,
): Promise<Subgraph<PropertyTypeRootType>> => {
  return await graphContext.graphApi
    .getPropertyTypesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<PropertyTypeRootType>);
};

export const getEntityTypes = async (
  query: EntityTypeStructuralQuery,
): Promise<Subgraph<EntityTypeRootType>> => {
  return await graphContext.graphApi
    .getEntityTypesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<EntityTypeRootType>);
};

export const getEntities = async (
  query: EntityStructuralQuery,
): Promise<Subgraph<EntityRootType>> => {
  return await graphContext.graphApi
    .getEntitiesByQuery(query)
    .then(({ data: subgraph }) => subgraph as Subgraph<EntityRootType>);
};
