import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type {
  ActorEntityUuid,
  EntityUuid,
  Timestamp,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * The `Flow Definition` entity of a flow definition, whose uuid is the flow definition's id: e.g. for a run or
 * trigger to link to. Its edition current at `atTime`, if given, and otherwise its current edition.
 */
export const getFlowDefinitionEntityById = async (params: {
  atTime?: Timestamp;
  flowDefinitionId: EntityUuid;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<HashEntity<FlowDefinitionEntity> | null> => {
  const { atTime, flowDefinitionId, graphApiClient, userAuthentication } =
    params;

  const {
    entities: [flowDefinitionEntity],
  } = await queryEntities<FlowDefinitionEntity>(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: {
        all: [
          { equal: [{ path: ["uuid"] }, { parameter: flowDefinitionId }] },
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter: systemEntityTypes.flowDefinition.entityTypeBaseUrl,
              },
            ],
          },
        ],
      },
      temporalAxes: atTime
        ? generateTimeInstantTemporalAxes(atTime)
        : currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return flowDefinitionEntity ?? null;
};
