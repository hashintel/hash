import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  EntityId,
  EntityUuid,
  UserId,
} from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";

import {
  addActorGroupMember,
  removeActorGroupMember,
} from "../../account-permission-management";
import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import type { Org } from "./org";
import { getOrgFromEntity } from "./org";
import type { User } from "./user";
import { getUserFromEntity } from "./user";

export type OrgMembership = {
  linkEntity: HashLinkEntity<IsMemberOf>;
};

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: HashLinkEntity },
  OrgMembership
> = ({ linkEntity }) => {
  if (
    !linkEntity.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      linkEntity.metadata.recordId.entityId,
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      linkEntity.metadata.entityTypeIds,
    );
  }

  return {
    linkEntity: linkEntity as HashLinkEntity<IsMemberOf>,
  };
};

/**
 * Create a link entity between a user and an org.
 * Note that this is NOT SUFFICIENT for a user to be fully a member of an org,
 * as the user must also be added to the org's actor group in the permission system,
 * unless the Graph has done this automatically (when a user creates an org).
 *
 * @todo H-4441 have the Graph handle memberOf link entity creation, as well as permisison handling.
 *
 * @param params.orgEntityId - the entityId of the org
 * @param params.userEntityId - the entityId of the user
 */
export const createOrgMembershipLinkEntity: ImpureGraphFunction<
  {
    orgEntityId: EntityId;
    userEntityId: EntityId;
  },
  Promise<OrgMembership>
> = async (ctx, authentication, { userEntityId, orgEntityId }) => {
  const userActorId = extractWebIdFromEntityId(userEntityId) as UserId;
  const orgWebId = extractWebIdFromEntityId(orgEntityId);

  const linkEntityEntityUuid = generateUuid() as EntityUuid;
  const linkEntity = await createLinkEntity<IsMemberOf>(ctx, authentication, {
    webId: orgWebId,
    entityUuid: linkEntityEntityUuid,
    properties: { value: {} },
    linkData: {
      leftEntityId: userEntityId,
      rightEntityId: orgEntityId,
    },
    entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
    relationships: createOrgMembershipAuthorizationRelationships({
      memberAccountId: userActorId,
    }),
    policies: [
      {
        name: `org-membership-update-entity-${linkEntityEntityUuid}`,
        principal: {
          type: "actor",
          actorType: "user",
          id: userActorId,
        },
        effect: "permit",
        actions: ["updateEntity", "archiveEntity"],
      },
    ],
  });

  return { linkEntity };
};

/**
 * Creates an org membership between a user and an org, which includes:
 * 1. Adding the user to the org's actor group in the permission system
 * 2. Creating a link entity between the user and the org, so that the membership is represented in the graph
 *
 * Note that when a user CREATES an org, the Graph automatically adds their membership,
 * and in that circumstance this function is bypassed in favour of {@link createOrgMembershipLinkEntity}
 *
 * @todo H-4441 have the Graph handle memberOf link entity creation, as well as permisison handling.
 *
 * @param params.orgEntityId - the entityId of the org
 * @param params.userEntityId - the entityId of the user
 */
export const createOrgMembership: ImpureGraphFunction<
  {
    orgEntityId: EntityId;
    userEntityId: EntityId;
  },
  Promise<OrgMembership>
> = async (ctx, authentication, { userEntityId, orgEntityId }) => {
  const userActorId = extractWebIdFromEntityId(userEntityId) as ActorEntityUuid;
  const orgWebId = extractWebIdFromEntityId(orgEntityId);

  await addActorGroupMember(ctx, authentication, {
    actorId: userActorId,
    actorGroupId: orgWebId as ActorGroupEntityUuid,
  });

  try {
    return await createOrgMembershipLinkEntity(ctx, authentication, {
      userEntityId,
      orgEntityId,
    });
  } catch (error) {
    await removeActorGroupMember(ctx, authentication, {
      actorId: userActorId,
      actorGroupId: orgWebId as ActorGroupEntityUuid,
    });

    throw error;
  }
};

/**
 * Get the org linked to the org membership.
 *
 * @param orgMembership - the org membership
 */
export const getOrgMembershipOrg: ImpureGraphFunction<
  { orgMembership: OrgMembership },
  Promise<Org>
> = async (ctx, authentication, { orgMembership }) => {
  const orgEntity = await getLinkEntityRightEntity(ctx, authentication, {
    linkEntity: orgMembership.linkEntity,
  });

  return getOrgFromEntity({ entity: orgEntity });
};

/**
 * Get the user linked to the org membership.
 *
 * @param params.orgMembership - the org membership
 */
export const getOrgMembershipUser: ImpureGraphFunction<
  { orgMembership: OrgMembership },
  Promise<User>
> = async (ctx, authentication, { orgMembership }) => {
  const userEntity = await getLinkEntityLeftEntity(ctx, authentication, {
    linkEntity: orgMembership.linkEntity,
  });

  return getUserFromEntity({ entity: userEntity });
};
