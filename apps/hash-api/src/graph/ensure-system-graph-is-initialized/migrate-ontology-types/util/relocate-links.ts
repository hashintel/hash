import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { queryPolicies } from "@local/hash-graph-sdk/policy";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { createLinkEntity } from "../../../knowledge/primitive/link-entity";

import type { ImpureGraphContext } from "../../../context-types";
import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  EntityUuid,
  WebId,
} from "@blockprotocol/type-system";
import type { AllFilter } from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";

const publicViewPolicyName = (entityUuid: EntityUuid) =>
  `public-view-entity-${entityUuid}`;

const getWebBotAuthentication = async (params: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext<false, true>;
  webId: WebId;
}): Promise<AuthenticationContext> => {
  const { authentication, context, webId } = params;

  const webBotAccountId = await getWebMachineId(context, authentication, {
    webId,
  });

  if (!webBotAccountId) {
    throw new Error(`Failed to get web bot account ID for web ID: ${webId}`);
  }

  return { actorId: webBotAccountId as ActorEntityUuid };
};

const linkFilter = (params: {
  linkEntityTypeBaseUrl: BaseUrl;
  webId: WebId;
}): AllFilter["all"] => [
  {
    equal: [
      { path: ["type", "baseUrl"] },
      { parameter: params.linkEntityTypeBaseUrl },
    ],
  },
  { equal: [{ path: ["webId"] }, { parameter: params.webId }] },
  { equal: [{ path: ["archived"] }, { parameter: false }] },
];

const endpointFilter = (params: {
  leftEntityId: EntityId;
  rightEntityId: EntityId;
}): AllFilter["all"] => [
  {
    equal: [
      { path: ["leftEntity", "uuid"] },
      { parameter: extractEntityUuidFromEntityId(params.leftEntityId) },
    ],
  },
  {
    equal: [
      { path: ["leftEntity", "webId"] },
      { parameter: extractWebIdFromEntityId(params.leftEntityId) },
    ],
  },
  {
    equal: [
      { path: ["rightEntity", "uuid"] },
      { parameter: extractEntityUuidFromEntityId(params.rightEntityId) },
    ],
  },
  {
    equal: [
      { path: ["rightEntity", "webId"] },
      { parameter: extractWebIdFromEntityId(params.rightEntityId) },
    ],
  },
];

/**
 * Move the links of the given type in the given web into the web of their right entity, by archiving each link and
 * creating a replacement which has the same endpoints, properties and public visibility.
 *
 * A link which already has a replacement in the right entity's web is only archived, so that a run which is
 * interrupted between the two steps does not leave a duplicate behind.
 */
export const relocateWebLinksToRightEntityWeb = async (params: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext<false, true>;
  linkEntityTypeBaseUrl: BaseUrl;
  webId: WebId;
}) => {
  const { authentication, context, linkEntityTypeBaseUrl, webId } = params;

  const webBotAuthentication = await getWebBotAuthentication({
    authentication,
    context,
    webId,
  });

  const { entities: linkEntities } = await queryEntities(
    context,
    webBotAuthentication,
    {
      filter: { all: linkFilter({ linkEntityTypeBaseUrl, webId }) },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  for (const linkEntity of linkEntities) {
    const { linkData } = linkEntity;
    const linkEntityId = linkEntity.metadata.recordId.entityId;

    if (!linkData) {
      throw new Error(`Entity ${linkEntityId} has no link data`);
    }

    const { leftEntityId, rightEntityId } = linkData;
    const rightEntityWebId = extractWebIdFromEntityId(rightEntityId);

    if (rightEntityWebId === webId) {
      continue;
    }

    const rightWebBotAuthentication = await getWebBotAuthentication({
      authentication,
      context,
      webId: rightEntityWebId,
    });

    const { entities: existingReplacements } = await queryEntities(
      context,
      rightWebBotAuthentication,
      {
        filter: {
          all: [
            ...linkFilter({
              linkEntityTypeBaseUrl,
              webId: rightEntityWebId,
            }),
            ...endpointFilter({ leftEntityId, rightEntityId }),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
        includePermissions: false,
      },
    );

    if (existingReplacements.length === 0) {
      const publiclyViewable = await queryPolicies(
        context.graphApi,
        authentication,
        {
          name: publicViewPolicyName(
            extractEntityUuidFromEntityId(linkEntityId),
          ),
        },
      ).then((policies) => policies.length > 0);

      const entityUuid = generateUuid() as EntityUuid;

      const policies: CreateEntityParameters["policies"] = publiclyViewable
        ? [
            {
              name: publicViewPolicyName(entityUuid),
              effect: "permit",
              actions: ["viewEntity"],
              principal: null,
            } as const,
          ]
        : undefined;

      await createLinkEntity(context, rightWebBotAuthentication, {
        webId: rightEntityWebId,
        entityUuid,
        entityTypeIds: linkEntity.metadata.entityTypeIds,
        properties: linkEntity.propertiesWithMetadata,
        linkData: { leftEntityId, rightEntityId },
        draft: extractDraftIdFromEntityId(linkEntityId) !== undefined,
        policies,
      });
    }

    await linkEntity.archive(
      context.graphApi,
      webBotAuthentication,
      context.provenance,
    );
  }
};
