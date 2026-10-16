import {
  extractEntityUuidFromEntityId,
  type ActorEntityUuid,
  type EntityUuid,
} from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { GraphApi } from "@local/hash-graph-client";

/**
 * What a flow run's links say about it: the flow definition it `Uses`, and the flow trigger (e.g. a schedule) it
 * was `Triggered By`, if any.
 */
export type FlowRunLinks = {
  flowDefinitionId: EntityUuid | null;
  flowTriggerId: EntityUuid | null;
};

/**
 * The links of each of the given flow runs, by flow run id, fetched in one query.
 */
export const getFlowRunLinks = async (params: {
  flowRunIds: EntityUuid[];
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<Map<EntityUuid, FlowRunLinks>> => {
  const { flowRunIds, graphApiClient, userAuthentication } = params;

  const linksByFlowRunId = new Map<EntityUuid, FlowRunLinks>(
    flowRunIds.map((flowRunId) => [
      flowRunId,
      { flowDefinitionId: null, flowTriggerId: null },
    ]),
  );

  if (flowRunIds.length === 0) {
    return linksByFlowRunId;
  }

  const { entities: linkEntities } = await queryEntities(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: {
        all: [
          {
            any: [
              systemLinkEntityTypes.uses.linkEntityTypeBaseUrl,
              systemLinkEntityTypes.triggeredBy.linkEntityTypeBaseUrl,
            ].map((baseUrl) => ({
              equal: [{ path: ["type", "baseUrl"] }, { parameter: baseUrl }],
            })),
          },
          {
            any: flowRunIds.map((flowRunId) => ({
              equal: [
                { path: ["leftEntity", "uuid"] },
                { parameter: flowRunId },
              ],
            })),
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  for (const linkEntity of linkEntities) {
    const { linkData } = linkEntity;

    if (!linkData) {
      continue;
    }

    const links = linksByFlowRunId.get(
      extractEntityUuidFromEntityId(linkData.leftEntityId),
    );

    if (!links) {
      continue;
    }

    const rightEntityUuid = extractEntityUuidFromEntityId(
      linkData.rightEntityId,
    );

    const isOfLinkType = (linkEntityTypeBaseUrl: string) =>
      linkEntity.metadata.entityTypeIds.some((entityTypeId) =>
        entityTypeId.startsWith(linkEntityTypeBaseUrl),
      );

    if (isOfLinkType(systemLinkEntityTypes.uses.linkEntityTypeBaseUrl)) {
      links.flowDefinitionId = rightEntityUuid;
    } else if (
      isOfLinkType(systemLinkEntityTypes.triggeredBy.linkEntityTypeBaseUrl)
    ) {
      links.flowTriggerId = rightEntityUuid;
    }
  }

  return linksByFlowRunId;
};
