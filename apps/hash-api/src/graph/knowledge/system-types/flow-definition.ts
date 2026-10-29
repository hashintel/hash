import { splitEntityId } from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { mapFlowDefinitionToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { createEntity, updateEntity } from "../primitive/entity";

import type { ImpureGraphFunction } from "../../context-types";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

/**
 * Creates a `Flow Definition` entity holding a definition, which needn't be valid yet.
 */
export const createFlowDefinition: ImpureGraphFunction<
  { webId: WebId; flowDefinition: FlowDefinition<string> },
  Promise<HashEntity<FlowDefinitionEntity>>
> = (context, authentication, { webId, flowDefinition }) =>
  createEntity<FlowDefinitionEntity>(context, authentication, {
    webId,
    entityTypeIds: [systemEntityTypes.flowDefinition.entityTypeId],
    properties: mapFlowDefinitionToEntityProperties(flowDefinition),
  });

/**
 * Replaces the definition a `Flow Definition` entity holds, creating a new edition. Runs already started keep the
 * edition they started with.
 */
export const updateFlowDefinition: ImpureGraphFunction<
  {
    entity: HashEntity<FlowDefinitionEntity>;
    flowDefinition: FlowDefinition<string>;
  },
  Promise<HashEntity<FlowDefinitionEntity>>,
  false,
  true
> = (context, authentication, { entity, flowDefinition }) =>
  updateEntity<FlowDefinitionEntity>(context, authentication, {
    entity,
    propertyPatches: [
      {
        op: "replace",
        path: [],
        property: mapFlowDefinitionToEntityProperties(flowDefinition),
      },
    ],
  });

/**
 * The active schedules that start runs of a flow, among those the user can view: those that `Use` its `Flow
 * Definition` entity and aren't paused or archived.
 */
export const getActiveFlowSchedulesOfFlowDefinition: ImpureGraphFunction<
  { flowDefinitionEntityId: EntityId },
  Promise<HashEntity<FlowSchedule>[]>
> = async (context, authentication, { flowDefinitionEntityId }) => {
  const [webId, entityUuid] = splitEntityId(flowDefinitionEntityId);

  const { entities } = await queryEntities<FlowSchedule>(
    context,
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.flowSchedule.entityTypeBaseUrl },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.scheduleStatus.propertyTypeBaseUrl,
                ],
              },
              { parameter: "active" },
            ],
          },
          /* A schedule's only outgoing link is the `Uses` link to the flow it runs. */
          {
            equal: [
              { path: ["outgoingLinks", "rightEntity", "webId"] },
              { parameter: webId },
            ],
          },
          {
            equal: [
              { path: ["outgoingLinks", "rightEntity", "uuid"] },
              { parameter: entityUuid },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return entities;
};
