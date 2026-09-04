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
import type { AllFilter, Filter } from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type {
  CreateEntityParameters,
  HashEntity,
} from "@local/hash-graph-sdk/entity";

const hasAvatarBaseUrl = systemLinkEntityTypes.hasAvatar.linkEntityTypeBaseUrl;

const publicViewPolicyName = (entityUuid: EntityUuid) =>
  `public-view-entity-${entityUuid}`;

type AvatarLink = {
  linkEntity: HashEntity;
  linkEntityId: EntityId;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
  webId: WebId;
  webBotAuthentication: AuthenticationContext;
  createdAt: number;
};

const hasAvatarLinkFilter = (webId: WebId): AllFilter["all"] => [
  {
    equal: [{ path: ["type", "baseUrl"] }, { parameter: hasAvatarBaseUrl }],
  },
  { equal: [{ path: ["webId"] }, { parameter: webId }] },
  { equal: [{ path: ["archived"] }, { parameter: false }] },
];

const rightEntityFilter = (rightEntityId: EntityId): AllFilter["all"] => [
  {
    equal: [
      { path: ["rightEntity", "uuid"] },
      { parameter: extractEntityUuidFromEntityId(rightEntityId) },
    ],
  },
  {
    equal: [
      { path: ["rightEntity", "webId"] },
      { parameter: extractWebIdFromEntityId(rightEntityId) },
    ],
  },
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
  ...rightEntityFilter(params.rightEntityId),
];

const compareNewestFirst = (first: AvatarLink, second: AvatarLink): number => {
  if (first.createdAt !== second.createdAt) {
    return second.createdAt - first.createdAt;
  }

  const firstInImageWeb =
    first.webId === extractWebIdFromEntityId(first.rightEntityId);
  const secondInImageWeb =
    second.webId === extractWebIdFromEntityId(second.rightEntityId);

  return Number(secondInImageWeb) - Number(firstInImageWeb);
};

const createWebBotAuthenticationGetter = (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
) => {
  const webBotAuthentications = new Map<WebId, AuthenticationContext>();

  return async (webId: WebId): Promise<AuthenticationContext> => {
    const cachedAuthentication = webBotAuthentications.get(webId);

    if (cachedAuthentication) {
      return cachedAuthentication;
    }

    const webBotAccountId = await getWebMachineId(context, authentication, {
      webId,
    });

    if (!webBotAccountId) {
      throw new Error(`Failed to get web bot account ID for web ID: ${webId}`);
    }

    const webBotAuthentication = {
      actorId: webBotAccountId as ActorEntityUuid,
    };

    webBotAuthentications.set(webId, webBotAuthentication);

    return webBotAuthentication;
  };
};

const collectWebAvatarLinks = async (
  context: ImpureGraphContext<false, true>,
  webBotAuthentication: AuthenticationContext,
  webId: WebId,
): Promise<AvatarLink[]> => {
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

  return linkEntities.map((linkEntity) => {
    const linkEntityId = linkEntity.metadata.recordId.entityId;

    if (!linkEntity.linkData) {
      throw new Error(`Entity ${linkEntityId} has no link data`);
    }

    return {
      linkEntity,
      linkEntityId,
      leftEntityId: linkEntity.linkData.leftEntityId,
      rightEntityId: linkEntity.linkData.rightEntityId,
      webId,
      webBotAuthentication,
      createdAt: new Date(
        linkEntity.metadata.provenance.createdAtDecisionTime,
      ).getTime(),
    };
  });
};

const archiveAvatarLink = async (
  context: ImpureGraphContext<false, true>,
  avatarLink: AvatarLink,
) =>
  avatarLink.linkEntity.archive(
    context.graphApi,
    avatarLink.webBotAuthentication,
    context.provenance,
  );

const moveAvatarLinkToImageWeb = async (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  imageWebBotAuthentication: AuthenticationContext,
  avatarLink: AvatarLink,
) => {
  const { linkEntity, linkEntityId, leftEntityId, rightEntityId } = avatarLink;
  const imageWebId = extractWebIdFromEntityId(rightEntityId);

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
        name: publicViewPolicyName(extractEntityUuidFromEntityId(linkEntityId)),
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

  await archiveAvatarLink(context, avatarLink);
};

const findReferencedImages = async (
  context: ImpureGraphContext<false, true>,
  webBotAuthentication: AuthenticationContext,
  webId: WebId,
  imageEntityIds: EntityId[],
): Promise<Set<EntityId>> => {
  const incomingLinkFilter: Filter = {
    all: [
      { equal: [{ path: ["webId"] }, { parameter: webId }] },
      { equal: [{ path: ["archived"] }, { parameter: false }] },
      {
        any: imageEntityIds.map((imageEntityId) => ({
          all: rightEntityFilter(imageEntityId),
        })),
      },
    ],
  };

  const { entities: incomingLinks } = await queryEntities(
    context,
    webBotAuthentication,
    {
      filter: incomingLinkFilter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  return new Set(
    incomingLinks.flatMap((incomingLink) =>
      incomingLink.linkData ? [incomingLink.linkData.rightEntityId] : [],
    ),
  );
};

const archiveImage = async (
  context: ImpureGraphContext<false, true>,
  imageWebBotAuthentication: AuthenticationContext,
  imageEntityId: EntityId,
) => {
  const { entities: images } = await queryEntities(
    context,
    imageWebBotAuthentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["uuid"] },
              { parameter: extractEntityUuidFromEntityId(imageEntityId) },
            ],
          },
          {
            equal: [
              { path: ["webId"] },
              { parameter: extractWebIdFromEntityId(imageEntityId) },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  for (const image of images) {
    await image.archive(
      context.graphApi,
      imageWebBotAuthentication,
      context.provenance,
    );
  }
};

/**
 * Leaves each user and organization with a single `Has Avatar` link, in the web of the image it points at.
 *
 * A link outside the image's web is only visible to actors with a role in the web it is in, which for an
 * organization's avatar excludes the other members of the organization. An organization whose avatar was
 * invisible to a member looked to that member as having none, so several links to several images can exist for
 * the same organization, spread across the personal webs of whoever uploaded them.
 *
 * The webs are visited one at a time as each web's bot, since no single actor can see the entities of every web,
 * and the links found are grouped by the user or organization they belong to. Within a group the link with the
 * latest `createdAtDecisionTime` wins; a winner outside its image's web is archived and recreated there with the
 * same endpoints, properties, draft state and public visibility, and every other link in the group is archived.
 * An image left with no non-archived link pointing at it, in any web, is archived too.
 *
 * A winner which already has a replacement in the image's web is only archived, and a run which finds one link
 * per user or organization, in the image's web, changes nothing, so the migration can be rerun or resumed after
 * an interruption without leaving duplicates.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const getWebBotAuthentication = createWebBotAuthenticationGetter(
    context,
    authentication,
  );

  const { users, orgs } = await getExistingUsersAndOrgs(
    context,
    authentication,
    {},
  );

  const webIds = [...users, ...orgs].map((webEntity) =>
    extractWebIdFromEntityId(webEntity.metadata.recordId.entityId),
  );

  const avatarLinksByLeftEntity = new Map<EntityId, AvatarLink[]>();

  for (const webId of webIds) {
    const avatarLinks = await collectWebAvatarLinks(
      context,
      await getWebBotAuthentication(webId),
      webId,
    );

    for (const avatarLink of avatarLinks) {
      const leftEntityLinks =
        avatarLinksByLeftEntity.get(avatarLink.leftEntityId) ?? [];

      leftEntityLinks.push(avatarLink);
      avatarLinksByLeftEntity.set(avatarLink.leftEntityId, leftEntityLinks);
    }
  }

  const keptImageEntityIds = new Set<EntityId>();
  const supersededImageEntityIds = new Set<EntityId>();

  for (const avatarLinks of avatarLinksByLeftEntity.values()) {
    const [newestLink, ...supersededLinks] = avatarLinks
      .slice()
      .sort(compareNewestFirst);

    if (!newestLink) {
      continue;
    }

    keptImageEntityIds.add(newestLink.rightEntityId);

    const imageWebId = extractWebIdFromEntityId(newestLink.rightEntityId);

    if (newestLink.webId !== imageWebId) {
      await moveAvatarLinkToImageWeb(
        context,
        authentication,
        await getWebBotAuthentication(imageWebId),
        newestLink,
      );
    }

    for (const supersededLink of supersededLinks) {
      await archiveAvatarLink(context, supersededLink);
      supersededImageEntityIds.add(supersededLink.rightEntityId);
    }
  }

  const candidateImageEntityIds = [...supersededImageEntityIds].filter(
    (imageEntityId) => !keptImageEntityIds.has(imageEntityId),
  );

  if (candidateImageEntityIds.length === 0) {
    return migrationState;
  }

  const referencedImageEntityIds = new Set<EntityId>();

  for (const webId of webIds) {
    const referencedInWeb = await findReferencedImages(
      context,
      await getWebBotAuthentication(webId),
      webId,
      candidateImageEntityIds,
    );

    for (const imageEntityId of referencedInWeb) {
      referencedImageEntityIds.add(imageEntityId);
    }
  }

  for (const imageEntityId of candidateImageEntityIds) {
    if (referencedImageEntityIds.has(imageEntityId)) {
      continue;
    }

    await archiveImage(
      context,
      await getWebBotAuthentication(extractWebIdFromEntityId(imageEntityId)),
      imageEntityId,
    );
  }

  return migrationState;
};

export default migrate;
