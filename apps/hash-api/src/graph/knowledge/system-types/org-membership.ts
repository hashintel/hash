import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";

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
  const userActorId = extractWebIdFromEntityId(userEntityId);
  const orgWebId = extractWebIdFromEntityId(orgEntityId);

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    orgWebId,
    userActorId,
  );

  let linkEntity;
  try {
    linkEntity = await createLinkEntity<IsMemberOf>(ctx, authentication, {
      webId: orgWebId,
      properties: { value: {} },
      linkData: {
        leftEntityId: userEntityId,
        rightEntityId: orgEntityId,
      },
      entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
      relationships: createOrgMembershipAuthorizationRelationships({
        memberAccountId: userActorId as ActorEntityUuid,
      }),
    });
  } catch (error) {
    await ctx.graphApi.removeAccountGroupMember(
      authentication.actorId,
      extractWebIdFromEntityId(orgEntityId),
      extractWebIdFromEntityId(userEntityId),
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
