import { createReadStream } from "node:fs";

import fetch from "node-fetch";

import { StatusCode } from "@local/status";

import type { GraphStatus } from "@rust/hash-graph-type-defs/typescript/status";

/**
 * Throw unless running in the snapshot group (`vitest.snapshot.config.ts`),
 * the only group allowed to wipe the shared system graph.
 */
const assertRunningInSnapshotGroup = (operation: string) => {
  if (process.env.HASH_TEST_GROUP !== "snapshot") {
    throw new Error(
      `\`${operation}\` wipes the graph seeded by \`globalSetup\`, so it may only run in the snapshot group (\`vitest.snapshot.config.ts\`). To make a test file destructive, place it under \`src/tests/subgraph/\`.`,
    );
  }
};

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const port = process.env.HASH_GRAPH_ADMIN_PORT || "4001";

const deleteRecords = async (endpoint: string) => {
  await fetch(`http://127.0.0.1:${port}/${endpoint}`, {
    method: "DELETE",
  }).then(async (response) => {
    const status = (await response.json()) as GraphStatus;
    if (status.code !== StatusCode.Ok) {
      throw new Error(
        `Could not remove ${endpoint}: ${JSON.stringify(status)}`,
      );
    }
  });
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
  await fetch(`http://127.0.0.1:${port}/entities/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authenticated-User-Actor-Id": "00000000-0000-0000-0000-000000000000",
    },
    body: JSON.stringify({
      filter: { all: [] },
      temporalAxes: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: { kind: "unbounded" },
            end: null,
          },
        },
      },
      includeDrafts: true,
      scope: "erase",
    }),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Could not remove entities: ${body}`);
    }
  });
};

/**
 * Restore a snapshot from a file.
 *
 * Destructive – may only run in the snapshot group.
 */
export const restoreSnapshot = async (snapshotPath: string) => {
  assertRunningInSnapshotGroup("restoreSnapshot");

  await fetch(`http://127.0.0.1:${port}/snapshot`, {
    method: "POST",
    body: createReadStream(snapshotPath),
  }).then(async (response) => {
    const status = (await response.json()) as GraphStatus;
    if (status.code !== StatusCode.Ok) {
      throw new Error(`Snapshot restoration error: ${JSON.stringify(status)}`);
    }
  });
};

/**
 * Delete a user and all associated data (entities, Kratos identity, Hydra sessions, email subscriptions).
 *
 * Accepts either a user ID or an email address.
 */
export const deleteUser = async (
  params: { userId: string } | { email: string },
) => {
  const response = await fetch(`http://127.0.0.1:${port}/users/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authenticated-User-Actor-Id": "00000000-0000-0000-0000-000000000000",
    },
    body: JSON.stringify(params),
  });

  const status = (await response.json()) as GraphStatus;
  if (status.code !== StatusCode.Ok) {
    throw new Error(`Could not delete user: ${JSON.stringify(status)}`);
  }
  return status;
};

/**
 * Reset the Graph.
 *
 * This is a convenience function for deleting all entities, entity types, property types, data types, and accounts.
 *
 * Destructive – may only run in the snapshot group.
 */
export const resetGraph = async () => {
  assertRunningInSnapshotGroup("resetGraph");

  await deleteEntities();
  await deleteEntityTypes();
  await deletePropertyTypes();
  await deleteDataTypes();
  await deleteAccounts();
};
