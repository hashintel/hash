import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { ActorEntityUuid, EntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * The `Flow Definition` entity of a flow definition, whose uuid is the flow definition's id: e.g. for a run or
 * trigger to link to.
 */
export const getFlowDefinitionEntityById = async (params: {
  flowDefinitionId: EntityUuid;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<HashEntity<FlowDefinitionEntity> | null> => {
  const { flowDefinitionId, graphApiClient, userAuthentication } = params;

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
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return flowDefinitionEntity ?? null;
};
