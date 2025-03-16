import type { EntityId, OwnedById } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { LinkEntity } from "@local/hash-graph-sdk/entity";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  extractActorGroupId,
  extractActorId,
} from "@local/hash-subgraph/stdlib";
import type {
  ActorEntityId,
  ActorGroupEntityId,
} from "@local/hash-subgraph/types";

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
  linkEntity: LinkEntity<IsMemberOf>;
};

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: LinkEntity },
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
    linkEntity: linkEntity as LinkEntity<IsMemberOf>,
  };
};

/**
 * Create a system OrgMembership entity.
 *
 * @param params.org - the org
 * @param params.user - the user
 *
 * @see {@link createLinkEntity} for the documentation of the remaining parameters
 */
export const createOrgMembership: ImpureGraphFunction<
  {
    orgEntityId: EntityId;
    userEntityId: EntityId;
  },
  Promise<OrgMembership>
> = async (ctx, authentication, { userEntityId, orgEntityId }) => {
  const userActorId = extractActorId(userEntityId as ActorEntityId);
  const orgActorGroupId = extractActorGroupId(
    orgEntityId as ActorGroupEntityId,
  );

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    orgActorGroupId,
    userActorId,
  );

  let linkEntity;
  try {
    linkEntity = await createLinkEntity<IsMemberOf>(ctx, authentication, {
      ownedById: orgActorGroupId as OwnedById,
      properties: { value: {} },
      linkData: {
        leftEntityId: userEntityId,
        rightEntityId: orgEntityId,
      },
      entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
      relationships: createOrgMembershipAuthorizationRelationships({
        memberAccountId: userActorId,
      }),
    });
  } catch (error) {
    await ctx.graphApi.removeAccountGroupMember(
      authentication.actorId,
      extractEntityUuidFromEntityId(orgEntityId),
      extractActorId(userEntityId as ActorEntityId),
    );

    throw error;
  }

  return { linkEntity };
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
