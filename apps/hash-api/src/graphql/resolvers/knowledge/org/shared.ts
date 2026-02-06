import type {
  EntityRootType,
  LinkEntityAndLeftEntity,
  Subgraph,
} from "@blockprotocol/graph";
import {
  getIncomingLinkAndSourceEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import {
  type EntityId,
  entityIdFromComponents,
  extractWebIdFromEntityId,
  type WebId,
} from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  isInvitationByEmail,
  isInvitationByShortname,
} from "@local/hash-isomorphic-utils/organization";
import type { Organization } from "@local/hash-isomorphic-utils/system-types/shared";

import type { ImpureGraphContext } from "../../../../graph/context-types";
import {
  getUser,
  type User,
} from "../../../../graph/knowledge/system-types/user";

const isOrgEntity = (entity: HashEntity): entity is HashEntity<Organization> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.organization.entityTypeId,
  );

export const getPendingOrgInvitationsFromSubgraph = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  subgraph: Subgraph<EntityRootType<HashEntity>>,
): Promise<
  (PendingOrgInvitation & {
    invitationEntity: HashEntity;
    linkEntity: HashLinkEntity;
  })[]
> => {
  const pendingInvitations: (PendingOrgInvitation & {
    invitationEntity: HashEntity;
    linkEntity: HashLinkEntity;
  })[] = [];

  const roots = getRoots<EntityRootType<HashEntity>>(subgraph);

  const creatorCache: Record<EntityId, User> = {};

  for (const root of roots) {
    const linkAndOrgEntities = getIncomingLinkAndSourceEntities<
      LinkEntityAndLeftEntity<HashEntity, HashLinkEntity>[]
    >(subgraph, root.entityId);

    const linkEntity = linkAndOrgEntities[0]?.linkEntity[0];

    if (!linkEntity) {
      throw new Error(
        `Pending invitation with entityId ${root.entityId} has no incoming link.`,
      );
    }

    if (
      !linkEntity.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId,
      )
    ) {
      throw new Error(
        `Pending invitation with entityId ${root.entityId} has types ${linkEntity.metadata.entityTypeIds.join(
          ", ",
        )}, expected to include ${systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId}.`,
      );
    }

    const orgEntity = linkAndOrgEntities[0]?.leftEntity[0];

    if (!orgEntity) {
      throw new Error(
        `Pending invitation with entityId ${root.entityId} is not linked to anything.`,
      );
    }

    if (!isOrgEntity(orgEntity)) {
      throw new Error(
        `Pending invitation with entityId ${root.entityId} is linked to an entity with types ${orgEntity.metadata.entityTypeIds.join(
          ", ",
        )}, expected to include ${systemEntityTypes.organization.entityTypeId}.`,
      );
    }

    const creatorId = linkEntity.metadata.provenance.createdById;

    const invitingUserEntityId = entityIdFromComponents(
      creatorId as WebId,
      creatorId,
    );

    const creator =
      creatorCache[invitingUserEntityId] ??
      (await getUser(context, authentication, {
        entityId: invitingUserEntityId,
      }));

    if (!creator) {
      throw new Error(
        `User with entityId ${invitingUserEntityId} doesn't exist or cannot be accessed by requesting user.`,
      );
    }

    creatorCache[invitingUserEntityId] ??= creator;

    const invitationBase: Pick<
      PendingOrgInvitation,
      "invitedBy" | "org" | "invitationEntityId" | "orgToInvitationLinkEntityId"
    > & {
      invitationEntity: HashEntity;
      linkEntity: HashLinkEntity;
    } = {
      invitedBy: {
        accountId: creator.accountId,
        displayName: creator.displayName!,
        shortname: creator.shortname!,
      },
      org: {
        webId: extractWebIdFromEntityId(orgEntity.metadata.recordId.entityId),
        displayName:
          orgEntity.properties[
            "https://hash.ai/@h/types/property-type/organization-name/"
          ],
        shortname:
          orgEntity.properties[
            "https://hash.ai/@h/types/property-type/shortname/"
          ],
      },
      invitationEntityId: root.entityId,
      orgToInvitationLinkEntityId: linkEntity.metadata.recordId.entityId,
      invitationEntity: root,
      linkEntity,
    };

    if (isInvitationByEmail(root)) {
      pendingInvitations.push({
        ...invitationBase,
        email: root.properties["https://hash.ai/@h/types/property-type/email/"],
        expiresAt:
          root.properties["https://hash.ai/@h/types/property-type/expired-at/"],
        invitedAt: root.metadata.provenance.createdAtDecisionTime,
      });
    } else if (isInvitationByShortname(root)) {
      pendingInvitations.push({
        ...invitationBase,
        shortname:
          root.properties["https://hash.ai/@h/types/property-type/shortname/"],
        expiresAt:
          root.properties["https://hash.ai/@h/types/property-type/expired-at/"],
        invitedAt: root.metadata.provenance.createdAtDecisionTime,
      });
    } else {
      throw new Error(
        `Pending invitation with entityId ${root.entityId} has unexpected types ${root.metadata.entityTypeIds.join(
          ", ",
        )}.`,
      );
    }
  }

  return pendingInvitations;
};
