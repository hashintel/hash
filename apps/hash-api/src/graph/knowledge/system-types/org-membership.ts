import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  AccountEntityId,
  AccountGroupEntityId,
  extractAccountGroupId,
  extractAccountId,
  extractEntityUuidFromEntityId} from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";

import type { getOrgFromEntity,Org  } from "./org";
import type { getUserFromEntity,User  } from "./user";

export interface OrgMembership {
  linkEntity: LinkEntity<IsMemberOf>;
}

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: LinkEntity },
  OrgMembership
> = ({ linkEntity }) => {
  if (
    linkEntity.metadata.entityTypeId !==
    systemLinkEntityTypes.isMemberOf.linkEntityTypeId
  ) {
    throw new EntityTypeMismatchError(
      linkEntity.metadata.recordId.entityId,
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      linkEntity.metadata.entityTypeId,
    );
  }

  return {
    linkEntity: linkEntity as LinkEntity<IsMemberOf>,
  };
};

/**
 * Create a system OrgMembership entity.
 *
 * @param params.org - The org.
 * @param params.user - The user.
 * @see {@link createLinkEntity} for the documentation of the remaining parameters
 */
export const createOrgMembership: ImpureGraphFunction<
  {
    orgEntityId: EntityId;
    userEntityId: EntityId;
  },
  Promise<OrgMembership>
> = async (ctx, authentication, { userEntityId, orgEntityId }) => {
  const userAccountId = extractAccountId(userEntityId as AccountEntityId);
  const orgAccountGroupId = extractAccountGroupId(
    orgEntityId as AccountGroupEntityId,
  );

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    orgAccountGroupId,
    userAccountId,
  );

  let linkEntity;

  try {
    linkEntity = await createLinkEntity<IsMemberOf>(ctx, authentication, {
      ownedById: orgAccountGroupId as OwnedById,
      properties: { value: {} },
      linkData: {
        leftEntityId: userEntityId,
        rightEntityId: orgEntityId,
      },
      entityTypeId: systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      relationships: createOrgMembershipAuthorizationRelationships({
        memberAccountId: userAccountId,
      }),
    });
  } catch (error) {
    await ctx.graphApi.removeAccountGroupMember(
      authentication.actorId,
      extractEntityUuidFromEntityId(orgEntityId),
      extractAccountId(userEntityId as AccountEntityId),
    );

    throw error;
  }

  return { linkEntity };
};

/**
 * Get the org linked to the org membership.
 *
 * @param orgMembership - The org membership.
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
 * @param params.orgMembership - The org membership.
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
