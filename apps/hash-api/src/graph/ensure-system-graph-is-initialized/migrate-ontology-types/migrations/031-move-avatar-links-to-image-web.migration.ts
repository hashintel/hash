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
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { createLinkEntity } from "../../../knowledge/primitive/link-entity";
import { getExistingUsersAndOrgs } from "../util";

import type { ImpureGraphContext } from "../../../context-types";
import type { MigrationFunction } from "../types";
import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  WebId,
} from "@blockprotocol/type-system";
import type { AllFilter } from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";

const hasAvatarBaseUrl = systemLinkEntityTypes.hasAvatar.linkEntityTypeBaseUrl;

const publicViewPolicyName = (entityUuid: EntityUuid) =>
  `public-view-entity-${entityUuid}`;

const getWebBotAuthentication = async (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  webId: WebId,
): Promise<AuthenticationContext> => {
  const webBotAccountId = await getWebMachineId(context, authentication, {
    webId,
  });

  if (!webBotAccountId) {
    throw new Error(`Failed to get web bot account ID for web ID: ${webId}`);
  }

  return { actorId: webBotAccountId as ActorEntityUuid };
};

const hasAvatarLinkFilter = (webId: WebId): AllFilter["all"] => [
  {
    equal: [{ path: ["type", "baseUrl"] }, { parameter: hasAvatarBaseUrl }],
  },
  { equal: [{ path: ["webId"] }, { parameter: webId }] },
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

const moveWebAvatarLinksToImageWeb = async (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  webId: WebId,
) => {
  const webBotAuthentication = await getWebBotAuthentication(
    context,
    authentication,
    webId,
  );

  const { entities: linkEntities } = await queryEntities(
    context,
    webBotAuthentication,
    {
      filter: { all: hasAvatarLinkFilter(webId) },
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
    const imageWebId = extractWebIdFromEntityId(rightEntityId);

    if (imageWebId === webId) {
      continue;
    }

    const imageWebBotAuthentication = await getWebBotAuthentication(
      context,
      authentication,
      imageWebId,
    );

    const { entities: existingReplacements } = await queryEntities(
      context,
      imageWebBotAuthentication,
      {
        filter: {
          all: [
            ...hasAvatarLinkFilter(imageWebId),
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

      await createLinkEntity(context, imageWebBotAuthentication, {
        webId: imageWebId,
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

/**
 * Moves each `Has Avatar` link into the web of the image it points at, by archiving the link and creating a
 * replacement there with the same endpoints, properties, draft state and public visibility. A link outside the
 * image's web is only visible to actors with a role in the web it is in, which for an organization's avatar
 * excludes the other members of the organization.
 *
 * The webs are visited one at a time as each web's bot, since no single actor can see the entities of every web.
 * A link which already has a replacement is only archived, so a run interrupted between the two steps leaves no
 * duplicate behind.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const { users, orgs } = await getExistingUsersAndOrgs(
    context,
    authentication,
    {},
  );

  for (const webEntity of [...users, ...orgs]) {
    await moveWebAvatarLinksToImageWeb(
      context,
      authentication,
      extractWebIdFromEntityId(webEntity.metadata.recordId.entityId),
    );
  }

  return migrationState;
};

export default migrate;
