import { promises as fs } from "node:fs";

import { GraphStatus } from "@apps/hash-graph/type-defs/status";
import fetch from "node-fetch";

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
