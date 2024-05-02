/**
 * @fileoverview This file contents queries which are local to the Temporal worker.
 * Queries that need to be sent from outside are in @local/hash-isomorphic-utils/src/flows/queries.ts
 */

import type { ExternalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/types";
import type { QueryDefinition } from "@temporalio/workflow";
import { defineQuery } from "@temporalio/workflow";

export type ExternalInputQueryRequest = {
  requestId: string;
};

/** Check if a request for external input mid-Flow has been fulfilled */
export type GetExternalInputResponseQuery = QueryDefinition<
  ExternalInputResponseSignal | null,
  [ExternalInputQueryRequest],
  "getExternalInputResponse"
>;

export const getExternalInputResponseQuery: GetExternalInputResponseQuery =
  defineQuery("getExternalInputResponse");
