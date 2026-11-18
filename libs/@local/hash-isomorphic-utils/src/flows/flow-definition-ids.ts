import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";

import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";

/**
 * The ids of the flows defined in code, which are also the entity uuids of their `Flow Definition` entities in the
 * `h` web.
 *
 * Code that starts a run of one of these flows, or recognises its runs, uses its id from here. The definitions are
 * in `definitions/`, which only seeding, the compiler and tests use: runs execute the definition stored in the
 * graph, and the frontend draws it from there.
 */
export const flowDefinitionIds = {
  goal: "ea4ac27d-7fe2-5400-ac72-ab4b41de9f67" as EntityUuid,
  manualBrowserInference: "a7bc5e44-f1ce-5126-b5db-8eb4cf054116" as EntityUuid,
  automaticBrowserInference:
    "a4385fa8-a457-584e-b81e-f7e49f3d0b3c" as EntityUuid,
  inferMetadataFromDocument:
    "936f6a29-a964-533b-ae1a-03bed7da6471" as EntityUuid,
  configureDashboardItem: "bf7f36a2-221e-5e7d-9879-289c1f56c148" as EntityUuid,
  refineDashboardItem: "6216ef71-5b7b-5468-bf12-9a34e30604b5" as EntityUuid,
  historicalFlights: "113ce2ec-6a12-56b6-b495-072475889b37" as EntityUuid,
  scheduledFlights: "96a80402-c41b-5978-a018-b30f7e09bfe0" as EntityUuid,
  ftseInvestors: "25f32cd2-6f6e-5641-92b7-d9a90e517e0f" as EntityUuid,
} as const;

/**
 * The entity id of one of the flows defined in code. They're seeded into the `h` web, the web the instance's
 * `HASH Instance` entity is in, whose id differs on every instance.
 */
export const generateHashFlowDefinitionEntityId = (
  hashWebId: WebId,
  flowDefinitionId: EntityUuid,
): EntityId => entityIdFromComponents(hashWebId, flowDefinitionId);

/**
 * Whether a run or definition is of one of the flows defined in code. Entity uuids are unique across webs, so the
 * uuid alone identifies it.
 */
export const isHashFlowDefinitionEntityId = (
  flowDefinitionEntityId: EntityId,
  flowDefinitionId: EntityUuid,
) => extractEntityUuidFromEntityId(flowDefinitionEntityId) === flowDefinitionId;

/**
 * Whether a run or definition is of the goal flow.
 */
export const isGoalFlowDefinitionEntityId = (
  flowDefinitionEntityId: EntityId,
) =>
  isHashFlowDefinitionEntityId(flowDefinitionEntityId, flowDefinitionIds.goal);
