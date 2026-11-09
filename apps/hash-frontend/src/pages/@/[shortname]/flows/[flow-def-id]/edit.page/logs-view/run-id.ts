import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";

import type { EntityId } from "@blockprotocol/type-system";

/** How many of the last characters of a run's entity uuid name the run. */
export const runIdLength = 6;

/** The run's short ID, e.g. "7a6a11": runs have no number of their own that holds across webs. */
export const getShortRunId = (flowRunEntityId: EntityId) =>
  extractEntityUuidFromEntityId(flowRunEntityId)
    .slice(-runIdLength)
    .toLowerCase();
