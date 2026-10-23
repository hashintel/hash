import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  type ActorEntityUuid,
  type EntityId,
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
  flowDefinitionEntityId: EntityId | null;
  flowTriggerId: EntityUuid | null;
};

/**
 * The links of each of the given flow runs, by the run's entity id, fetched in one query.
 *
 * Only links in the run's own web count. Anyone who can view a run can link from it in a web of their own, and such
 * a link mustn't change which flow or trigger the run is shown as belonging to.
 */
export const getFlowRunLinks = async (params: {
  flowRunEntityIds: EntityId[];
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<Map<EntityId, FlowRunLinks>> => {
  const { flowRunEntityIds, graphApiClient, userAuthentication } = params;

  const linksByFlowRunEntityId = new Map<EntityId, FlowRunLinks>(
    flowRunEntityIds.map((flowRunEntityId) => [
      flowRunEntityId,
      { flowDefinitionEntityId: null, flowTriggerId: null },
    ]),
  );

  if (flowRunEntityIds.length === 0) {
    return linksByFlowRunEntityId;
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
            any: flowRunEntityIds.map((flowRunEntityId) => ({
              equal: [
                { path: ["leftEntity", "uuid"] },
                { parameter: extractEntityUuidFromEntityId(flowRunEntityId) },
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

    const links = linksByFlowRunEntityId.get(linkData.leftEntityId);

    if (
      !links ||
      extractWebIdFromEntityId(linkEntity.metadata.recordId.entityId) !==
        extractWebIdFromEntityId(linkData.leftEntityId)
    ) {
      continue;
    }

    const isOfLinkType = (linkEntityTypeBaseUrl: string) =>
      linkEntity.metadata.entityTypeIds.some((entityTypeId) =>
        entityTypeId.startsWith(linkEntityTypeBaseUrl),
      );

    const link = isOfLinkType(systemLinkEntityTypes.uses.linkEntityTypeBaseUrl)
      ? {
          field: "flowDefinitionEntityId" as const,
          linkName: "Uses",
          target: linkData.rightEntityId,
        }
      : isOfLinkType(systemLinkEntityTypes.triggeredBy.linkEntityTypeBaseUrl)
        ? {
            field: "flowTriggerId" as const,
            linkName: "Triggered By",
            target: extractEntityUuidFromEntityId(linkData.rightEntityId),
          }
        : null;

    if (!link) {
      continue;
    }

    /* A run is created with one link of each kind, so another can only have been added since. The last one read wins. */
    const existingTarget = links[link.field];

    if (existingTarget && existingTarget !== link.target) {
      // eslint-disable-next-line no-console
      console.warn(
        `Flow run ${linkData.leftEntityId} has more than one ${link.linkName} link in its web, to ${existingTarget} and ${link.target}`,
      );
    }

    if (link.field === "flowDefinitionEntityId") {
      links.flowDefinitionEntityId = link.target;
    } else {
      links.flowTriggerId = link.target;
    }
  }

  return linksByFlowRunEntityId;
};
